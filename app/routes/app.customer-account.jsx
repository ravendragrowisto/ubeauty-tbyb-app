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
  Badge,
  DataTable,
  EmptyState,
  Banner,
  InlineStack,
  Modal,
  FormLayout,
  TextField,
  Select,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");

  if (!customerId) {
    return json({ error: "Customer ID is required" }, { status: 400 });
  }

  // Get customer details
  const customerResponse = await admin.graphql(
    `#graphql
      query getCustomer($customerId: ID!) {
        customer(id: $customerId) {
          id
          firstName
          lastName
          email
          phone
          createdAt
        }
      }`,
    {
      variables: {
        customerId: customerId,
      },
    }
  );

  const customerData = await customerResponse.json();
  const customer = customerData.data.customer;

  if (!customer) {
    return json({ error: "Customer not found" }, { status: 404 });
  }

  // Get customer's TBYB history
  const tbybHistory = await db.customerSampleHistory.findMany({
    where: {
      shop: session.shop,
      customerId: customerId,
    },
    orderBy: { createdAt: "desc" },
  });

  // Get product details for each history item
  const productIds = [...new Set(tbybHistory.map(h => h.productId))];
  const productDetails = {};

  for (const productId of productIds) {
    try {
      const productResponse = await admin.graphql(
        `#graphql
          query getProduct($productId: ID!) {
            product(id: $productId) {
              id
              title
              handle
              featuredImage {
                url
                altText
              }
            }
          }`,
        {
          variables: {
            productId: productId,
          },
        }
      );

      const productData = await productResponse.json();
      if (productData.data.product) {
        productDetails[productId] = productData.data.product;
      }
    } catch (error) {
      console.error(`Error fetching product ${productId}:`, error);
    }
  }

  return json({
    customer,
    tbybHistory,
    productDetails,
    shop: session.shop,
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "confirmOrder") {
    const historyId = formData.get("historyId");
    
    const sampleHistory = await db.customerSampleHistory.findFirst({
      where: {
        id: historyId,
        shop: session.shop,
      },
    });

    if (!sampleHistory) {
      return json({ success: false, message: "Sample history not found" });
    }

    // Update status to confirmed
    await db.customerSampleHistory.update({
      where: { id: historyId },
      data: {
        status: "CONFIRMED",
        updatedAt: new Date(),
      },
    });

    // Here you would typically:
    // 1. Create the full-size product order
    // 2. Process the remaining payment
    // 3. Set up fulfillment
    // For now, we'll just update the status

    return json({ success: true, message: "Order confirmed successfully" });
  }

  if (actionType === "cancelTrial") {
    const historyId = formData.get("historyId");
    
    await db.customerSampleHistory.update({
      where: {
        id: historyId,
        shop: session.shop,
      },
      data: {
        status: "CANCELLED",
        updatedAt: new Date(),
      },
    });

    return json({ success: true, message: "Trial cancelled successfully" });
  }

  return json({ success: false, message: "Unknown action" });
};

export default function CustomerAccount() {
  const { customer, tbybHistory, productDetails, shop } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [modalActive, setModalActive] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);

  const isLoading = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message);
      if (modalActive) {
        setModalActive(false);
        setSelectedHistory(null);
      }
    } else if (fetcher.data?.success === false) {
      shopify.toast.show(fetcher.data.message, { isError: true });
    }
  }, [fetcher.data, shopify, modalActive]);

  const handleConfirmOrder = (historyId) => {
    fetcher.submit(
      {
        actionType: "confirmOrder",
        historyId,
      },
      { method: "POST" }
    );
  };

  const handleCancelTrial = (historyId) => {
    fetcher.submit(
      {
        actionType: "cancelTrial",
        historyId,
      },
      { method: "POST" }
    );
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "SAMPLE_ORDERED":
        return <Badge status="info">Sample Ordered</Badge>;
      case "TRIAL_ACTIVE":
        return <Badge status="success">Trial Active</Badge>;
      case "TRIAL_EXPIRED":
        return <Badge status="warning">Trial Expired</Badge>;
      case "CONFIRMED":
        return <Badge status="success">Confirmed</Badge>;
      case "CANCELLED":
        return <Badge status="critical">Cancelled</Badge>;
      case "COMPLETED":
        return <Badge status="success">Completed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getTrialDaysRemaining = (trialEndDate) => {
    if (!trialEndDate) return null;
    const now = new Date();
    const endDate = new Date(trialEndDate);
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // Prepare table data
  const tableRows = tbybHistory.map((history) => {
    const product = productDetails[history.productId];
    const productTitle = product ? product.title : "Product not found";
    const trialDaysRemaining = getTrialDaysRemaining(history.trialEndDate);
    
    return [
      product?.featuredImage ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <img
            src={product.featuredImage.url}
            alt={product.featuredImage.altText || productTitle}
            style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" }}
          />
          <span>{productTitle}</span>
        </div>
      ) : productTitle,
      new Date(history.createdAt).toLocaleDateString(),
      history.trialEndDate ? new Date(history.trialEndDate).toLocaleDateString() : "-",
      trialDaysRemaining !== null ? `${trialDaysRemaining} days` : "-",
      getStatusBadge(history.status),
      <InlineStack key={history.id} gap="200">
        {(history.status === "TRIAL_ACTIVE" || history.status === "TRIAL_EXPIRED") && (
          <>
            <Button
              size="slim"
              onClick={() => handleConfirmOrder(history.id)}
              loading={isLoading}
            >
              Confirm Order
            </Button>
            <Button
              size="slim"
              variant="secondary"
              onClick={() => handleCancelTrial(history.id)}
              loading={isLoading}
            >
              Cancel
            </Button>
          </>
        )}
        {history.status === "SAMPLE_ORDERED" && (
          <Button
            size="slim"
            variant="secondary"
            onClick={() => handleCancelTrial(history.id)}
            loading={isLoading}
          >
            Cancel
          </Button>
        )}
        {(history.status === "CONFIRMED" || history.status === "COMPLETED") && (
          <Badge status="success">Complete</Badge>
        )}
        {history.status === "CANCELLED" && (
          <Badge status="critical">Cancelled</Badge>
        )}
      </InlineStack>,
    ];
  });

  const activeTrials = tbybHistory.filter(h => h.status === "TRIAL_ACTIVE").length;
  const expiredTrials = tbybHistory.filter(h => h.status === "TRIAL_EXPIRED").length;
  const confirmedOrders = tbybHistory.filter(h => h.status === "CONFIRMED" || h.status === "COMPLETED").length;

  if (!customer) {
    return (
      <Page>
        <Banner status="critical">
          <p>Customer not found or invalid customer ID provided.</p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page>
      <TitleBar title={`TBYB Account - ${customer.firstName} ${customer.lastName}`} />

      <BlockStack gap="500">
        {/* Customer Info */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Customer Details
                </Text>
                <Text as="p">
                  <strong>Name:</strong> {customer.firstName} {customer.lastName}
                </Text>
                <Text as="p">
                  <strong>Email:</strong> {customer.email}
                </Text>
                {customer.phone && (
                  <Text as="p">
                    <strong>Phone:</strong> {customer.phone}
                  </Text>
                )}
                <Text as="p" variant="bodySm" tone="subdued">
                  Customer since {new Date(customer.createdAt).toLocaleDateString()}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Stats */}
          <Layout.Section variant="twoThirds">
            <Layout>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">
                      Active Trials
                    </Text>
                    <Text as="p" variant="displayMd">
                      {activeTrials}
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">
                      Expired Trials
                    </Text>
                    <Text as="p" variant="displayMd">
                      {expiredTrials}
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
                      {confirmedOrders}
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </Layout.Section>
        </Layout>

        {/* Expired Trials Banner */}
        {expiredTrials > 0 && (
          <Banner status="warning">
            <p>
              This customer has {expiredTrials} expired trial{expiredTrials > 1 ? 's' : ''} that need{expiredTrials === 1 ? 's' : ''} attention.
            </p>
          </Banner>
        )}

        {/* TBYB History Table */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Try Before You Buy History
                </Text>

                {tbybHistory.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                    headings={["Product", "Order Date", "Trial End", "Days Remaining", "Status", "Actions"]}
                    rows={tableRows}
                  />
                ) : (
                  <EmptyState
                    heading="No TBYB history"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>This customer hasn't used Try Before You Buy yet.</p>
                  </EmptyState>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
} 