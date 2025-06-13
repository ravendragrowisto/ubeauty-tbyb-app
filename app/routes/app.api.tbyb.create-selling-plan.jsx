import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// CORS headers for theme extension access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// This route is called by theme extensions to create selling plans
// It handles the authentication internally
export const action = async ({ request }) => {
  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { productId, variantId } = body;

    if (!productId || !variantId) {
      return json({ success: false, message: "Product ID and Variant ID are required" }, { headers: corsHeaders });
    }

    // Get admin authentication - this will work because we're in the app context
    const { admin, session } = await authenticate.admin(request);
    
    const TBYB_CONFIG = {
      trialDays: 14,
      depositAmount: 10,
      maxSamplesPerProduct: 3
    };

    // First, get the product variant to determine pricing
    const variantResponse = await admin.graphql(`
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

    const variantData = await variantResponse.json();
    const variant = variantData.data.productVariant;
    
    if (!variant) {
      return json({ success: false, message: "Product variant not found" }, { headers: corsHeaders });
    }

    const productPrice = parseFloat(variant.price);
    
    // Calculate deposit percentage (minimum 10%, maximum 90%)
    const depositPercentage = Math.min(90, Math.max(10, (TBYB_CONFIG.depositAmount / productPrice) * 100));

    // Check if selling plan already exists for this product
    const existingPlansResponse = await admin.graphql(`
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
                  pricingPolicies {
                    adjustmentType
                    adjustmentValue {
                      ... on SellingPlanPricingPolicyPercentageValue {
                        percentage
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, {
      variables: { id: `gid://shopify/Product/${productId}` }
    });

    const existingData = await existingPlansResponse.json();
    const product = existingData.data.product;
    
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

    // Create new selling plan group
    const sellingPlanGroupResponse = await admin.graphql(`
      mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!, $resources: [SellingPlanGroupResourceInput!]) {
        sellingPlanGroupCreate(input: $input, resources: $resources) {
          sellingPlanGroup {
            id
            name
            merchantCode
            sellingPlans(first: 10) {
              nodes {
                id
                name
                description
                billingPolicy {
                  ... on SellingPlanRecurringBillingPolicy {
                    interval
                    intervalCount
                  }
                }
                deliveryPolicy {
                  ... on SellingPlanRecurringDeliveryPolicy {
                    interval
                    intervalCount
                  }
                }
                pricingPolicies {
                  adjustmentType
                  adjustmentValue {
                    ... on SellingPlanPricingPolicyPercentageValue {
                      percentage
                    }
                    ... on MoneyV2 {
                      amount
                      currencyCode
                    }
                  }
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
          name: `TBYB - ${variant.product.title}`,
          merchantCode: `TBYB_${variant.product.handle}_${Date.now()}`,
          description: `Try Before You Buy for ${variant.product.title}`,
          options: ["Trial Period"],
          position: 1,
          sellingPlans: [
            {
              name: `${TBYB_CONFIG.trialDays}-Day Trial`,
              description: `Pay $${TBYB_CONFIG.depositAmount} deposit now, try for ${TBYB_CONFIG.trialDays} days, then pay remaining balance`,
              options: [`${TBYB_CONFIG.trialDays} days`],
              position: 1,
              billingPolicy: {
                recurring: {
                  interval: "DAY",
                  intervalCount: TBYB_CONFIG.trialDays,
                  anchors: [
                    {
                      type: "WEEKDAY",
                      day: 1
                    }
                  ]
                }
              },
              deliveryPolicy: {
                recurring: {
                  interval: "DAY", 
                  intervalCount: 1,
                  anchors: [
                    {
                      type: "WEEKDAY",
                      day: 1
                    }
                  ]
                }
              },
              pricingPolicies: [
                {
                  adjustmentType: "PERCENTAGE",
                  adjustmentValue: {
                    percentage: depositPercentage
                  }
                }
              ]
            }
          ]
        },
        resources: {
          productIds: [`gid://shopify/Product/${productId}`],
          productVariantIds: [`gid://shopify/ProductVariant/${variantId}`]
        }
      }
    });

    const groupData = await sellingPlanGroupResponse.json();
    
    if (groupData.data.sellingPlanGroupCreate.userErrors.length > 0) {
      return json({
        success: false,
        message: groupData.data.sellingPlanGroupCreate.userErrors[0].message
      }, { headers: corsHeaders });
    }

    const sellingPlanGroup = groupData.data.sellingPlanGroupCreate.sellingPlanGroup;
    const sellingPlan = sellingPlanGroup.sellingPlans.nodes[0];

    return json({
      success: true,
      created: true,
      sellingPlan: {
        id: sellingPlan.id,
        name: sellingPlan.name,
        description: sellingPlan.description,
        groupId: sellingPlanGroup.id
      },
      config: {
        trialDays: TBYB_CONFIG.trialDays,
        depositAmount: TBYB_CONFIG.depositAmount,
        depositPercentage: depositPercentage,
        originalPrice: productPrice
      }
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("Error creating selling plan:", error);
    return json({
      success: false,
      message: error.message || "Failed to create selling plan"
    }, { status: 500, headers: corsHeaders });
  }
};

export const loader = async ({ request }) => {
  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  return json({ message: "Method not allowed" }, { status: 405, headers: corsHeaders });
}; 