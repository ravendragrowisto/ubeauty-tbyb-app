import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  try {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

    if (!payload) {
      return new Response("No payload", { status: 400 });
    }

    console.log(`Processing ${topic} webhook for shop: ${shop}`);

    // Process TBYB subscription contract
    await processTBYBSubscription(payload, admin, session);

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing subscription_contracts/create webhook:", error);
    return new Response("Error", { status: 500 });
  }
};

async function processTBYBSubscription(contract, admin, session) {
  try {
    // Check if this is a TBYB selling plan
    const sellingPlan = contract.selling_plan;
    
    if (!sellingPlan || !sellingPlan.merchant_code || !sellingPlan.merchant_code.includes('TBYB')) {
      console.log('Not a TBYB subscription contract:', contract.id);
      return;
    }

    console.log(`Processing TBYB subscription contract ${contract.id} for selling plan ${sellingPlan.id}`);

    // Get the original order information
    const orderId = contract.origin_order_id;
    if (!orderId) {
      console.error('No origin order ID found in subscription contract');
      return;
    }

    // Update the customer sample history with subscription contract details
    try {
      const updated = await db.customerSampleHistory.updateMany({
        where: {
          sampleOrderId: orderId.toString(),
          status: 'SAMPLE_ORDERED'
        },
        data: {
          status: 'TRIAL_ACTIVE',
          subscriptionContractId: contract.id.toString(),
          sellingPlanId: sellingPlan.id
        }
      });

      console.log(`Updated ${updated.count} TBYB records with subscription contract ${contract.id}`);
    } catch (dbError) {
      console.error('Error updating TBYB records with subscription contract:', dbError);
    }

    // Set up the first billing cycle skip (since customer already paid deposit)
    // The next billing cycle will charge the remaining amount after trial period
    try {
      await admin.graphql(`
        mutation subscriptionBillingCycleSkip($subscriptionContractId: ID!, $billingCycleInput: SubscriptionBillingCycleSkipInput!) {
          subscriptionBillingCycleSkip(subscriptionContractId: $subscriptionContractId, billingCycleInput: $billingCycleInput) {
            subscriptionBillingCycle {
              cycleIndex
              skipped
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          subscriptionContractId: `gid://shopify/SubscriptionContract/${contract.id}`,
          billingCycleInput: {
            reason: "CUSTOMER_INITIATED",
            reasonComment: "TBYB trial period - customer paid deposit, skip first billing cycle"
          }
        }
      });

      console.log(`Skipped first billing cycle for TBYB subscription ${contract.id}`);
    } catch (skipError) {
      console.error('Error skipping billing cycle:', skipError);
    }

    // Add metafields to the subscription contract
    try {
      await admin.graphql(`
        mutation subscriptionContractUpdate($contractId: ID!, $input: SubscriptionContractUpdateInput!) {
          subscriptionContractUpdate(contractId: $contractId, input: $input) {
            contract {
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
          contractId: `gid://shopify/SubscriptionContract/${contract.id}`,
          input: {
            metafields: [
              {
                key: "tbyb_trial_start",
                value: new Date().toISOString(),
                type: "date_time"
              },
              {
                key: "tbyb_trial_end",
                value: new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)).toISOString(),
                type: "date_time"
              },
              {
                key: "tbyb_status",
                value: "trial_active",
                type: "single_line_text_field"
              },
              {
                key: "tbyb_origin_order",
                value: orderId.toString(),
                type: "single_line_text_field"
              }
            ]
          }
        }
      });

      console.log(`Added TBYB metafields to subscription contract ${contract.id}`);
    } catch (metafieldsError) {
      console.error('Error adding metafields to subscription contract:', metafieldsError);
    }

  } catch (error) {
    console.error('Error processing TBYB subscription:', error);
  }
} 