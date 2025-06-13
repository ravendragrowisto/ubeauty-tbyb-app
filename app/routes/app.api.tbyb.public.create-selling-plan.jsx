import { json } from "@remix-run/node";
import { authenticate, sessionStorage } from "../shopify.server";
import { createAdminApiClient } from '@shopify/admin-api-client';

// CORS headers for theme extension access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shopify-Shop-Domain',
};

// Handle preflight OPTIONS requests
export const loader = async ({ request }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  return json({ message: "Method not allowed" }, { status: 405, headers: corsHeaders });
};

// Public API endpoint for theme extensions to create selling plans
export const action = async ({ request }) => {
  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { productId, variantId, shopDomain } = body;

    if (!productId || !variantId) {
      return json({ 
        success: false, 
        message: "Product ID and Variant ID are required" 
      }, { headers: corsHeaders });
    }

    if (!shopDomain) {
      return json({ 
        success: false, 
        message: "Shop domain is required for authentication" 
      }, { headers: corsHeaders });
    }

    // Find existing session for this shop
    const sessions = await sessionStorage.findSessionsByShop(shopDomain);
    
    if (!sessions || sessions.length === 0) {
      return json({
        success: false,
        message: "No active session found for this shop. Please install and configure the app first."
      }, { headers: corsHeaders });
    }

    // Use the most recent session
    const session = sessions[sessions.length - 1];
    
    if (!session.accessToken) {
      return json({
        success: false,
        message: "Invalid session - no access token found."
      }, { headers: corsHeaders });
    }

    // Create admin API client with the session token
    const admin = createAdminApiClient({
      storeDomain: shopDomain,
      apiVersion: '2025-04',
      accessToken: session.accessToken,
    });

    const TBYB_CONFIG = {
      trialDays: 14,
      depositAmount: 10,
      maxSamplesPerProduct: 3
    };

    try {
      // Get the product variant to determine pricing
      const variantResponse = await admin.request(`
        query getVariant($id: ID!) {
          productVariant(id: $id) {
            id
            price
            product {
              id
              title
              handle
            }
          }
        }
      `, {
        variables: { id: `gid://shopify/ProductVariant/${variantId}` }
      });



      if (!variantResponse.data || !variantResponse.data.productVariant) {
        return json({ 
          success: false, 
          message: "Product variant not found",
          debug: variantResponse
        }, { headers: corsHeaders });
      }

      const variant = variantResponse.data.productVariant;
      
      if (!variant) {
        return json({ 
          success: false, 
          message: "Product variant not found" 
        }, { headers: corsHeaders });
      }

      // Note: variant.product may be null but we still proceed

      const productPrice = parseFloat(variant.price);
      const depositPercentage = Math.min(90, Math.max(10, (TBYB_CONFIG.depositAmount / productPrice) * 100));

      // Check if selling plan already exists
      const existingPlansResponse = await admin.request(`
        query getProductSellingPlans($id: ID!) {
          product(id: $id) {
            id
            title
            sellingPlanGroups(first: 5) {
              nodes {
                id
                name
                merchantCode
                sellingPlans(first: 5) {
                  nodes {
                    id
                    name
                    description
                    category
                  }
                }
              }
            }
          }
        }
      `, {
        variables: { id: `gid://shopify/Product/${productId}` }
      });


      
      const product = existingPlansResponse.data?.product;
      
      if (!product) {
        return json({ 
          success: false, 
          message: "Product not found",
          debug: existingPlansResponse
        }, { headers: corsHeaders });
      }
      
      // Look for existing TBYB selling plan
      let tbybSellingPlan = null;
      let tbybGroup = null;
      
      for (const group of product.sellingPlanGroups.nodes) {
        if (group.merchantCode && group.merchantCode.includes('TBYB')) {
          tbybGroup = group;
          tbybSellingPlan = group.sellingPlans.nodes[0];
          break;
        }
      }

      // If selling plan already exists, return it
      if (tbybSellingPlan) {
        return json({
          success: true,
          exists: true,
          sellingPlan: {
            id: tbybSellingPlan.id,
            name: tbybSellingPlan.name,
            description: tbybSellingPlan.description,
            groupId: tbybGroup.id
          },
          config: {
            trialDays: TBYB_CONFIG.trialDays,
            depositAmount: TBYB_CONFIG.depositAmount,
            depositPercentage: depositPercentage,
            originalPrice: productPrice
          }
        }, { headers: corsHeaders });
      }

      // Create new selling plan group using the exact structure from Shopify documentation
      
      let sellingPlanGroupResponse;
      try {
        sellingPlanGroupResponse = await admin.request(`
        mutation createSellingPlanGroup($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput) {
          sellingPlanGroupCreate(input: $input, resources: $resources) {
            sellingPlanGroup {
              id
              sellingPlans(first: 1) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            name: "TBYB",
            merchantCode: "tbyb",
            options: [
              "Try before you buy"
            ],
            sellingPlansToCreate: [
              {
                name: "TBYB",
                options: `Try free for ${TBYB_CONFIG.trialDays} days`,
                category: "TRY_BEFORE_YOU_BUY",
                billingPolicy: {
                  fixed: {
                    checkoutCharge: {
                      type: "PRICE",
                      value: {
                        fixedValue: TBYB_CONFIG.depositAmount
                      }
                    },
                    remainingBalanceChargeTrigger: "TIME_AFTER_CHECKOUT",
                    remainingBalanceChargeTimeAfterCheckout: `P${TBYB_CONFIG.trialDays}D`
                  }
                },
                inventoryPolicy: {
                  reserve: "ON_SALE"
                },
                deliveryPolicy: {
                  fixed: {
                    fulfillmentTrigger: "ASAP"
                  }
                }
              }
            ]
          },
          resources: {
            productIds: [
              `gid://shopify/Product/${productId}`
            ],
            productVariantIds: []
          }
        }
      });
      } catch (mutationError) {
        console.error('Selling plan creation error:', mutationError);
        return json({
          success: false,
          message: `Failed to create selling plan: ${mutationError.message}`,
          error: mutationError
        }, { headers: corsHeaders });
      }


      
      const groupData = sellingPlanGroupResponse.data.sellingPlanGroupCreate;
      
      if (groupData.userErrors && groupData.userErrors.length > 0) {
        return json({
          success: false,
          message: groupData.userErrors[0].message,
          userErrors: groupData.userErrors
        }, { headers: corsHeaders });
      }

      const sellingPlanGroup = groupData.sellingPlanGroup;
      
      if (!sellingPlanGroup) {
        return json({
          success: false,
          message: "Failed to create selling plan group"
        }, { headers: corsHeaders });
      }

      const sellingPlan = sellingPlanGroup.sellingPlans.edges[0]?.node;
      
      if (!sellingPlan) {
        return json({
          success: false,
          message: "Selling plan was not created"
        }, { headers: corsHeaders });
      }

      return json({
        success: true,
        created: true,
        sellingPlan: {
          id: sellingPlan.id,
          name: "TBYB",
          description: `Try free for ${TBYB_CONFIG.trialDays} days`,
          groupId: sellingPlanGroup.id
        },
        config: {
          trialDays: TBYB_CONFIG.trialDays,
          depositAmount: TBYB_CONFIG.depositAmount,
          depositPercentage: depositPercentage,
          originalPrice: productPrice,
          isRealSellingPlan: true
        }
      }, { headers: corsHeaders });

    } catch (graphqlError) {
      console.error("GraphQL Error:", graphqlError);
      return json({
        success: false,
        message: `GraphQL Error: ${graphqlError.message}`
      }, { status: 500, headers: corsHeaders });
    }

  } catch (error) {
    console.error("Error in public selling plan creation:", error);
    return json({
      success: false,
      message: error.message || "Failed to create selling plan"
    }, { status: 500, headers: corsHeaders });
  }
}; 