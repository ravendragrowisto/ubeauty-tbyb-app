import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  try {
    const { admin, session, payload } = await authenticate.webhook(request);

    const paymentTerm = payload;
    
    // Update payment term status in database
    await db.tBYBPaymentTerm.update({
      where: {
        shop_paymentTermId: {
          shop: session.shop,
          paymentTermId: paymentTerm.id,
        },
      },
      data: {
        status: "PAID",
        updatedAt: new Date(),
      },
    });

    // Update customer sample history to confirmed
    const sampleHistory = await db.customerSampleHistory.findFirst({
      where: {
        shop: session.shop,
        deferredOrderId: paymentTerm.order_id,
      },
    });

    if (sampleHistory) {
      await db.customerSampleHistory.update({
        where: { id: sampleHistory.id },
        data: {
          status: "CONFIRMED",
          updatedAt: new Date(),
        },
      });

      // Update order metafield to show confirmed status
      await admin.graphql(
        `#graphql
          mutation orderUpdate($input: OrderInput!) {
            orderUpdate(input: $input) {
              order {
                id
                metafields(first: 10) {
                  edges {
                    node {
                      id
                      key
                      value
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }`,
        {
          variables: {
            input: {
              id: paymentTerm.order_id,
              metafields: [
                {
                  namespace: "tbyb",
                  key: "status",
                  value: "CONFIRMED",
                  type: "single_line_text_field",
                },
                {
                  namespace: "tbyb",
                  key: "confirmation_date",
                  value: new Date().toISOString(),
                  type: "date_time",
                },
              ],
            },
          },
        }
      );

      console.log(`TBYB order confirmed: ${paymentTerm.order_id}, customer paid remaining balance`);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing TBYB payment term webhook:", error);
    return new Response("Error", { status: 500 });
  }
}; 