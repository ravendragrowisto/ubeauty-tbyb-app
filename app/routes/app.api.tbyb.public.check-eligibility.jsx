import { json } from "@remix-run/node";
import { sessionStorage } from "../shopify.server";
import { createAdminApiClient } from '@shopify/admin-api-client';
import db from "../db.server";

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

// Public API endpoint for theme extensions to check eligibility
export const action = async ({ request }) => {
  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { productId, variantId, customerId, shopDomain, cartToken } = body;

    if (!productId || !variantId) {
      return json({ 
        success: false, 
        message: "Product ID and Variant ID are required" 
      }, { headers: corsHeaders });
    }

    const config = {
      trialDays: 14,
      depositAmount: "10",
      maxSamplesPerProduct: 3,
    };

    // Check customer sample history if possible
    let customerEligible = true;
    let sampleCount = 0;
    let cartHasSample = false;
    let cartSampleProductId = null;
    
    if (customerId) {
      try {
        const sampleHistory = await db.customerSampleHistory.findMany({
          where: {
            customerId: customerId.toString(),
            productId: productId.toString(),
          }
        });
        
        sampleCount = sampleHistory.length;
        customerEligible = sampleCount < 3;
      } catch (dbError) {
        console.log("Database check failed, allowing sample:", dbError.message);
      }
    }

    // Check current cart for existing TBYB samples if we have shop access
    if (shopDomain) {
      try {
        // Find existing session for this shop
        const sessions = await sessionStorage.findSessionsByShop(shopDomain);
        
        if (sessions && sessions.length > 0) {
          const session = sessions[sessions.length - 1];
          
          if (session.accessToken) {
            // Create admin API client with the session token
            const admin = createAdminApiClient({
              storeDomain: shopDomain,
              apiVersion: '2025-04',
              accessToken: session.accessToken,
            });

            // If we have a cart token, check for existing TBYB samples
            if (cartToken) {
              try {
                const cartResponse = await fetch(`https://${shopDomain}/cart/${cartToken}.js`);
                if (cartResponse.ok) {
                  const cartData = await cartResponse.json();
                  
                  // Check each item in cart for TBYB samples
                  for (const item of cartData.items) {
                    if (item.properties && item.properties._tbyb_sample === 'true') {
                      cartHasSample = true;
                      // Extract product ID from variant
                      if (item.product_id) {
                        cartSampleProductId = item.product_id.toString();
                      }
                      break;
                    }
                  }
                }
              } catch (cartError) {
                console.log("Could not check cart for existing samples:", cartError.message);
              }
            }

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

            const product = existingPlansResponse.data.product;
            
            // Look for existing TBYB selling plan
            for (const group of product.sellingPlanGroups.nodes) {
              if (group.merchantCode && (group.merchantCode.includes('TBYB') || group.merchantCode === 'tbyb')) {
                sellingPlan = {
                  id: group.sellingPlans.nodes[0].id,
                  name: group.sellingPlans.nodes[0].name,
                  description: group.sellingPlans.nodes[0].description || `Try free for ${config.trialDays} days`,
                  groupId: group.id
                };
                isRealSellingPlan = true;
                break;
              }
            }
          }
        }
      } catch (error) {
        console.log("Could not get real selling plan or check cart, using mock:", error.message);
      }
    }

    // Determine final eligibility
    let finalEligible = customerEligible;
    let ineligibilityReason = null;

    // Check for cart sample restrictions
    if (cartHasSample) {
      if (cartSampleProductId === productId.toString()) {
        // Same product - check if this specific variant is already in cart
        finalEligible = false;
        ineligibilityReason = "sample_already_in_cart_same_product";
      } else {
        // Different product - only one sample per order allowed
        finalEligible = false;
        ineligibilityReason = "sample_already_in_cart_different_product";
      }
    }

    // Check sample count limit
    if (sampleCount >= 3) {
      finalEligible = false;
      ineligibilityReason = "max_samples_reached";
    }

    // Initialize selling plan variables
    let sellingPlan = null;
    let isRealSellingPlan = false;

    // Fall back to mock selling plan if no real one found
    if (!sellingPlan) {
      sellingPlan = {
        id: `mock-${productId}-${variantId}`,
        name: `TBYB - ${config.trialDays} Day Trial`,
        description: `Try for ${config.trialDays} days, pay $${config.depositAmount} deposit now`,
        needsCreation: true
      };
    }

    return json({
      success: true,
      eligible: finalEligible,
      config: {
        ...config,
        currentSampleCount: sampleCount,
        isRealSellingPlan: isRealSellingPlan
      },
      sellingPlan: sellingPlan,
      ineligibilityReason: ineligibilityReason,
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("Error in public eligibility check:", error);
    return json({
      success: false,
      message: "Internal server error",
    }, { status: 500, headers: corsHeaders });
  }
}; 