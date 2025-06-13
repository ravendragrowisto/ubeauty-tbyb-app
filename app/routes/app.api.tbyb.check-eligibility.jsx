import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// CORS headers for theme extension access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const action = async ({ request }) => {
  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { productId, variantId, customerId } = body;

    if (!productId || !variantId) {
      return json({ success: false, message: "Product ID and Variant ID are required" }, { headers: corsHeaders });
    }

    // For authenticated admin calls, create real selling plans
    try {
      const { admin } = await authenticate.admin(request);
      return await createRealSellingPlan(admin, productId, variantId, customerId, request);
    } catch (authError) {
      // For theme extension calls (no admin auth), try storefront approach
      console.log("Admin auth failed, trying storefront approach:", authError.message);
      return await handleStorefrontRequest(productId, variantId, customerId);
    }
  } catch (error) {
    console.error("Error checking TBYB eligibility:", error);
    return json({
      success: false,
      message: "Internal server error",
    }, { status: 500, headers: corsHeaders });
  }
};

async function createRealSellingPlan(admin, productId, variantId, customerId, request) {
  try {
    // First check if selling plan already exists for this product
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

    // If no TBYB selling plan exists, create one
    if (!tbybSellingPlan) {
      const createResponse = await fetch(`${new URL(request.url).origin}/app/api/tbyb/selling-plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('Authorization') || '',
          'Cookie': request.headers.get('Cookie') || ''
        },
        body: JSON.stringify({
          action: 'create',
          productId,
          variantId
        })
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create selling plan');
      }

      const createData = await createResponse.json();
      tbybSellingPlan = createData.sellingPlan;
      tbybGroup = createData.sellingPlanGroup;
    }

    // Check customer eligibility (sample history)
    let customerEligible = true;
    let sampleCount = 0;
    
    if (customerId) {
      try {
        const sampleHistory = await db.customerSampleHistory.findMany({
          where: {
            customerId: customerId.toString(),
            productId: productId.toString(),
          }
        });
        
        sampleCount = sampleHistory.length;
        customerEligible = sampleCount < 3; // Max 3 samples per product
      } catch (dbError) {
        console.log("Database check failed, allowing sample:", dbError.message);
      }
    }

    return json({
      success: true,
      eligible: customerEligible,
      config: {
        trialDays: 14,
        depositAmount: "10",
        maxSamplesPerProduct: 3,
        currentSampleCount: sampleCount
      },
      sellingPlan: {
        id: tbybSellingPlan.id,
        name: tbybSellingPlan.name,
        description: tbybSellingPlan.description,
        groupId: tbybGroup.id
      },
      product: {
        id: product.id,
        title: product.title
      }
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("Error creating real selling plan:", error);
    throw error;
  }
}

async function handleStorefrontRequest(productId, variantId, customerId) {
  // For storefront requests without admin auth, use default config
  // This maintains compatibility with theme extensions
  const config = {
    trialDays: 14,
    depositAmount: "10",
    maxSamplesPerProduct: 3,
  };

  // Check customer sample history if possible
  let customerEligible = true;
  let sampleCount = 0;
  
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
      console.log("Database check failed for storefront request:", dbError.message);
    }
  }

  // For storefront calls, we'll return mock selling plan data
  // The frontend will need to call the admin API to create real selling plans
  const mockSellingPlan = {
    id: `mock-${productId}-${variantId}`,
    name: `TBYB - ${config.trialDays} Day Trial`,
    description: `Try for ${config.trialDays} days, pay $${config.depositAmount} deposit now`,
    needsCreation: true // Flag to indicate this needs real creation
  };

  return json({
    success: true,
    eligible: customerEligible,
    config: {
      trialDays: config.trialDays,
      depositAmount: config.depositAmount,
      maxSamplesPerProduct: config.maxSamplesPerProduct,
      currentSampleCount: sampleCount
    },
    sellingPlan: mockSellingPlan,
  }, { headers: corsHeaders });
}

// Handle preflight requests for CORS
export const loader = async ({ request }) => {
  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  return json({ message: "Method not allowed" }, { status: 405, headers: corsHeaders });
}; 