import { json } from "@remix-run/node";
import { sessionStorage } from "../shopify.server";
import { createAdminApiClient } from '@shopify/admin-api-client';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const loader = async ({ request }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  return json({ message: "Method not allowed" }, { status: 405, headers: corsHeaders });
};

export const action = async ({ request }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { shopDomain, variantId } = body;

    // Debug 1: Check session lookup
    console.log('Looking up sessions for shop:', shopDomain);
    const sessions = await sessionStorage.findSessionsByShop(shopDomain);
    console.log('Found sessions:', sessions ? sessions.length : 0);
    
    if (!sessions || sessions.length === 0) {
      return json({
        debug: "session_lookup",
        success: false,
        message: "No sessions found",
        shopDomain
      }, { headers: corsHeaders });
    }

    const session = sessions[sessions.length - 1];
    console.log('Using session:', session.id, 'has token:', !!session.accessToken);

    if (!session.accessToken) {
      return json({
        debug: "session_token",
        success: false,
        message: "No access token in session",
        sessionId: session.id
      }, { headers: corsHeaders });
    }

    // Debug 2: Test admin API client creation
    try {
      const admin = createAdminApiClient({
        storeDomain: shopDomain,
        apiVersion: '2025-04',
        accessToken: session.accessToken,
      });

      // Debug 3: Simple GraphQL query first (shop info)
      const shopQuery = await admin.request(`
        query {
          shop {
            name
            id
            myshopifyDomain
          }
        }
      `);

      console.log('Shop query result:', JSON.stringify(shopQuery, null, 2));

      if (variantId) {
        // Debug 4: Try variant query
        const variantQuery = await admin.request(`
          query getVariant($id: ID!) {
            productVariant(id: $id) {
              id
              title
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

        console.log('Variant query result:', JSON.stringify(variantQuery, null, 2));

        // Debug 5: Try product selling plans query
        const productId = variantQuery.data.productVariant.product.id.replace('gid://shopify/Product/', '');
        const productQuery = await admin.request(`
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
                    }
                  }
                }
              }
            }
          }
        `, {
          variables: { id: `gid://shopify/Product/${productId}` }
        });

        console.log('Product selling plans query result:', JSON.stringify(productQuery, null, 2));

        return json({
          debug: "graphql_success",
          success: true,
          shop: shopQuery.data.shop,
          variant: variantQuery.data.productVariant,
          product: productQuery.data.product,
          variantId: `gid://shopify/ProductVariant/${variantId}`,
          productId: `gid://shopify/Product/${productId}`
        }, { headers: corsHeaders });
      }

      return json({
        debug: "shop_query_success",
        success: true,
        shop: shopQuery.data.shop
      }, { headers: corsHeaders });

    } catch (apiError) {
      console.error('API Client Error:', apiError);
      return json({
        debug: "api_client_error",
        success: false,
        message: apiError.message,
        stack: apiError.stack
      }, { headers: corsHeaders });
    }

  } catch (error) {
    console.error('Debug endpoint error:', error);
    return json({
      debug: "general_error",
      success: false,
      message: error.message,
      stack: error.stack
    }, { status: 500, headers: corsHeaders });
  }
}; 