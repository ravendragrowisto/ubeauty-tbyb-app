import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Create or get existing selling plan for TBYB
export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const body = await request.json();
    const { action: actionType, productId, variantId } = body;

    if (actionType === "create") {
      return await createSellingPlan(admin, productId, variantId);
    } else if (actionType === "get") {
      return await getSellingPlan(admin, productId);
    } else if (actionType === "assign") {
      return await assignSellingPlan(admin, body.sellingPlanId, body.productVariantIds);
    }

    return json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Selling plan API error:", error);
    return json({ 
      success: false, 
      message: error.message || "Failed to process selling plan request" 
    }, { status: 500 });
  }
};

async function createSellingPlan(admin, productId, variantId) {
  const TBYB_CONFIG = {
    trialDays: 14,
    depositAmount: 10,
    depositPercentage: null // We'll calculate this based on product price
  };

  try {
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
      throw new Error("Product variant not found");
    }

    const productPrice = parseFloat(variant.price);
    const depositPercentage = Math.min(90, Math.max(10, (TBYB_CONFIG.depositAmount / productPrice) * 100));

    // Create selling plan group
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
                  ... on SellingPlanPricingPolicy {
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
      throw new Error(groupData.data.sellingPlanGroupCreate.userErrors[0].message);
    }

    const sellingPlanGroup = groupData.data.sellingPlanGroupCreate.sellingPlanGroup;
    const sellingPlan = sellingPlanGroup.sellingPlans.nodes[0];

    return json({
      success: true,
      sellingPlanGroup,
      sellingPlan,
      config: {
        trialDays: TBYB_CONFIG.trialDays,
        depositAmount: TBYB_CONFIG.depositAmount,
        depositPercentage: depositPercentage,
        originalPrice: productPrice
      }
    });

  } catch (error) {
    console.error("Error creating selling plan:", error);
    throw error;
  }
}

async function getSellingPlan(admin, productId) {
  try {
    // Get existing selling plans for the product
    const response = await admin.graphql(`
      query getProductSellingPlans($id: ID!) {
        product(id: $id) {
          id
          title
          sellingPlanGroups(first: 10) {
            nodes {
              id
              name
              merchantCode
              sellingPlans(first: 10) {
                nodes {
                  id
                  name
                  description
                }
              }
            }
          }
        }
      }
    `, {
      variables: { id: `gid://shopify/Product/${productId}` }
    });

    const data = await response.json();
    const product = data.data.product;
    
    // Look for TBYB selling plans
    const tbybGroups = product.sellingPlanGroups.nodes.filter(group => 
      group.merchantCode && group.merchantCode.includes('TBYB')
    );

    return json({
      success: true,
      product,
      tbybSellingPlanGroups: tbybGroups
    });

  } catch (error) {
    console.error("Error getting selling plans:", error);
    throw error;
  }
}

async function assignSellingPlan(admin, sellingPlanId, productVariantIds) {
  try {
    const response = await admin.graphql(`
      mutation sellingPlanGroupAddProducts($id: ID!, $productVariantIds: [ID!]!) {
        sellingPlanGroupAddProductVariants(id: $id, productVariantIds: $productVariantIds) {
          sellingPlanGroup {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        id: sellingPlanId,
        productVariantIds: productVariantIds
      }
    });

    const data = await response.json();
    
    if (data.data.sellingPlanGroupAddProductVariants.userErrors.length > 0) {
      throw new Error(data.data.sellingPlanGroupAddProductVariants.userErrors[0].message);
    }

    return json({
      success: true,
      message: "Selling plan assigned successfully"
    });

  } catch (error) {
    console.error("Error assigning selling plan:", error);
    throw error;
  }
}

export const loader = async ({ request }) => {
  return json({ message: "Method not allowed" }, { status: 405 });
}; 