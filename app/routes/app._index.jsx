import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
  DataTable,
  Badge,
  TextField,
  Select,
  Modal,
  FormLayout,
  Spinner,
  Banner,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Get products from Shopify
  const productsResponse = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              status
              productType
              vendor
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }`
  );

  const productsData = await productsResponse.json();

  // Get TBYB configurations from database
  const tbybConfigs = await db.tBYBConfig.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  // Get customer sample history stats
  const sampleHistoryStats = await db.customerSampleHistory.groupBy({
    by: ["status"],
    where: { shop: session.shop },
    _count: {
      id: true,
    },
  });

  return json({
    products: productsData.data.products.edges,
    tbybConfigs,
    sampleHistoryStats,
    shop: session.shop,
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "createTBYBConfig") {
    const productId = formData.get("productId");
    const trialDays = parseInt(formData.get("trialDays"));
    const depositAmount = formData.get("depositAmount");
    const maxSamplesPerProduct = parseInt(formData.get("maxSamplesPerProduct"));

    // Create selling plan for TBYB
    const sellingPlanResponse = await admin.graphql(
      `#graphql
        mutation createSellingPlanGroup($input: SellingPlanGroupInput!) {
          sellingPlanGroupCreate(input: $input) {
            sellingPlanGroup {
              id
              name
              sellingPlans(first: 5) {
                edges {
                  node {
                    id
                    name
                    description
                    category
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
            name: "Try Before You Buy",
            description: `${trialDays}-day trial with $${depositAmount} deposit`,
            sellingPlans: [
              {
                name: `TBYB - ${trialDays} Day Trial`,
                description: `Try for ${trialDays} days, pay $${depositAmount} deposit now, rest later if you keep it`,
                category: "TRY_BEFORE_YOU_BUY",
                billingPolicy: {
                  interval: "DAY",
                  intervalCount: trialDays,
                },
                deliveryPolicy: {
                  interval: "DAY",
                  intervalCount: 1,
                },
                pricingPolicies: [
                  {
                    fixed: {
                      adjustmentType: "FIXED_AMOUNT",
                      adjustmentValue: {
                        amount: depositAmount,
                        currencyCode: "USD",
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      }
    );

    const sellingPlanData = await sellingPlanResponse.json();

    if (sellingPlanData.data.sellingPlanGroupCreate.userErrors.length === 0) {
      // Save configuration to database
      await db.tBYBConfig.create({
        data: {
          productId,
          enabled: true,
          trialDays,
          depositAmount,
          maxSamplesPerProduct,
          shop: session.shop,
        },
      });

      return json({ success: true, message: "TBYB configuration created successfully" });
    } else {
      return json({ 
        success: false, 
        message: "Failed to create selling plan: " + sellingPlanData.data.sellingPlanGroupCreate.userErrors[0].message 
      });
    }
  }

  if (actionType === "toggleTBYBConfig") {
    const configId = formData.get("configId");
    const enabled = formData.get("enabled") === "true";

    await db.tBYBConfig.update({
      where: { id: configId },
      data: { enabled },
    });

    return json({ success: true, message: `TBYB ${enabled ? "enabled" : "disabled"} successfully` });
  }

  return json({ success: false, message: "Unknown action" });
};

export default function TBYBAdmin() {
  const { products, tbybConfigs, sampleHistoryStats, shop } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isLoading = ["loading", "submitting"].includes(fetcher.state);



  // Stats for dashboard
  const statsCards = sampleHistoryStats.map((stat) => ({
    status: stat.status,
    count: stat._count.id,
  }));

  return (
    <Page>
      <TitleBar title="Try Before You Buy - Dashboard" />

      <BlockStack gap="500">
        {/* Dashboard Stats */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Active Trials
                </Text>
                <Text as="p" variant="displayMd">
                  {statsCards.find(s => s.status === "TRIAL_ACTIVE")?.count || 0}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Confirmed Orders
                </Text>
                <Text as="p" variant="displayMd">
                  {statsCards.find(s => s.status === "CONFIRMED")?.count || 0}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Cancelled Trials
                </Text>
                <Text as="p" variant="displayMd">
                  {statsCards.find(s => s.status === "CANCELLED")?.count || 0}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Information Banner */}
        <Banner status="success">
          <p>
            <strong>Try Before You Buy is now active for all products!</strong><br/>
            Your customers can try any product with these default settings: 14 day trial period, $10.00 deposit, max 3 samples per product.
          </p>
        </Banner>

        {/* Setup Instructions */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Setup Instructions
                </Text>
                
                <List type="number">
                  <List.Item>
                    Go to your theme editor: <Link url={`https://${shop}/admin/themes/current/editor`} external>Customize Theme</Link>
                  </List.Item>
                  <List.Item>
                    Navigate to a product page template
                  </List.Item>
                  <List.Item>
                    Add the "Try Before You Buy Button" block to your product page
                  </List.Item>
                  <List.Item>
                    Customize the appearance and settings as needed
                  </List.Item>
                  <List.Item>
                    Save your changes
                  </List.Item>
                </List>
                
                <Text variant="bodyMd" color="subdued">
                  The TBYB button will automatically appear on all product pages where it's added, with no additional configuration required.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {tbybConfigs.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Custom Product Configurations
                  </Text>
                  <Text variant="bodyMd" color="subdued">
                    These products have custom TBYB settings that override the defaults.
                  </Text>
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text"]}
                    headings={["Product", "Trial Period", "Deposit", "Max Samples", "Status"]}
                    rows={tbybConfigs.map((config) => {
                      const product = products.find(p => p.node.id === config.productId);
                      const productTitle = product ? product.node.title : "Product not found";
                      
                      return [
                        productTitle,
                        `${config.trialDays} days`,
                        `$${config.depositAmount}`,
                        config.maxSamplesPerProduct.toString(),
                        <Badge key={config.id} status={config.enabled ? "success" : "critical"}>
                          {config.enabled ? "Enabled" : "Disabled"}
                        </Badge>,
                      ];
                    })}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}
