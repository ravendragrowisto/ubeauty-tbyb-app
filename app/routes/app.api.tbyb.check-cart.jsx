import { json } from "@remix-run/node";

export const action = async ({ request }) => {
  try {
    const body = await request.json();
    const { productId, variantId } = body;

    if (!productId || !variantId) {
      return json({ 
        success: false, 
        message: "Product ID and Variant ID are required" 
      });
    }

    // For theme extension calls, we'll allow cart operations for all products
    // This is a simplified version for frontend use
    
    const config = {
      trialDays: 14,
      depositAmount: "10",
    };

    // Basic validation - for theme extensions, we'll allow all operations
    return json({
      success: true,
      message: "Sample can be added to cart",
      rules: {
        maxSamplesPerOrder: 1,
        mixedCartAllowed: true,
        tbybConfig: {
          trialDays: config.trialDays,
          depositAmount: config.depositAmount,
        },
      },
    });

  } catch (error) {
    console.error("Error checking cart compatibility:", error);
    return json({
      success: false,
      message: "Internal server error",
    }, { status: 500 });
  }
};

export const loader = async () => {
  return json({ message: "Method not allowed" }, { status: 405 });
}; 