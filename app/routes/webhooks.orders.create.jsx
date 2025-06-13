import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  try {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

    if (!payload) {
      return new Response("No payload", { status: 400 });
    }

    console.log(`Processing ${topic} webhook for shop: ${shop}`);

    // Process TBYB orders
    await processTBYBOrder(payload, admin, session);

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing orders/create webhook:", error);
    return new Response("Error", { status: 500 });
  }
};

async function processTBYBOrder(order, admin, session) {
  try {
    // Check if this order contains TBYB samples
    const tbybLineItems = order.line_items.filter(item => 
      item.properties && 
      item.properties.some(prop => prop.name === '_tbyb_sample' && prop.value === 'true')
    );

    if (tbybLineItems.length === 0) {
      console.log('No TBYB items in order', order.id);
      return;
    }

    console.log(`Processing TBYB order ${order.id} with ${tbybLineItems.length} TBYB items`);

    // Process each TBYB line item
    for (const lineItem of tbybLineItems) {
      await processTBYBLineItem(order, lineItem, admin, session);
    }

    // Update order metafields
    await admin.graphql(`
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            metafields(first: 10) {
              nodes {
                key
                value
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
          id: `gid://shopify/Order/${order.id}`,
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
              key: "tbyb_order_type",
              value: "sample_order",
              type: "single_line_text_field"
            }
          ]
        }
      }
    });

  } catch (error) {
    console.error('Error processing TBYB order:', error);
  }
}

async function processTBYBLineItem(order, lineItem, admin, session) {
  try {
    // Extract TBYB properties
    const tbybProps = {};
    lineItem.properties.forEach(prop => {
      if (prop.name.startsWith('_tbyb_')) {
        tbybProps[prop.name] = prop.value;
      }
    });

    const trialDays = parseInt(tbybProps['_tbyb_trial_days']) || 14;
    const trialStartDate = new Date();
    const trialEndDate = new Date(Date.now() + (trialDays * 24 * 60 * 60 * 1000));

    // Save to database
    try {
      await db.customerSampleHistory.create({
        data: {
          customerId: order.customer?.id?.toString() || 'guest',
          productId: lineItem.product_id?.toString(),
          variantId: lineItem.variant_id?.toString(),
          sampleOrderId: order.id.toString(),
          trialStartDate: trialStartDate,
          trialEndDate: trialEndDate,
          status: 'SAMPLE_ORDERED',
          depositAmount: parseFloat(tbybProps['_tbyb_deposit']) || 10,
          trialDays: trialDays,
          sellingPlanId: lineItem.selling_plan_allocation?.selling_plan?.id || null
        }
      });

      console.log(`Saved TBYB trial record for customer ${order.customer?.id} and product ${lineItem.product_id}`);
    } catch (dbError) {
      console.error('Error saving TBYB trial record:', dbError);
    }

    // If there's a selling plan, create subscription contract
    if (lineItem.selling_plan_allocation && lineItem.selling_plan_allocation.selling_plan) {
      console.log('Order has selling plan allocation:', lineItem.selling_plan_allocation.selling_plan.id);
      
      // The subscription contract will be automatically created by Shopify
      // We'll handle it in the subscription_contracts/create webhook
    }

    // Create fulfillment for immediate shipping of sample
    try {
      await admin.graphql(`
        mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          fulfillment: {
            orderId: `gid://shopify/Order/${order.id}`,
            lineItems: [
              {
                id: `gid://shopify/LineItem/${lineItem.id}`,
                quantity: lineItem.quantity
              }
            ],
            trackingInfo: {
              company: "TBYB Sample",
              number: `TBYB-${order.id}-${lineItem.id}`
            },
            notifyCustomer: true
          }
        }
      });

      console.log(`Created fulfillment for TBYB sample order ${order.id}`);
    } catch (fulfillmentError) {
      console.error('Error creating fulfillment:', fulfillmentError);
    }

  } catch (error) {
    console.error('Error processing TBYB line item:', error);
  }
} 