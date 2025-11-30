import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";

// Get backend URL from environment
const getBackendUrl = () => {
  return (
    process.env.BACKEND_URL ||
    process.env.MEDUSA_BACKEND_URL ||
    "http://localhost:9000"
  );
};

// Handle CORS preflight requests
export async function OPTIONS(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  res.status(200).end();
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params;
  const backendUrl = getBackendUrl();

  try {
    // Simple: Just proxy the store API and add metadata from admin API
    // First get product from store API
    const publishableKey = req.headers["x-publishable-api-key"] as string;

    const storeResponse = await fetch(`${backendUrl}/store/products/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...(publishableKey ? { "x-publishable-api-key": publishableKey } : {}),
      },
    });

    if (!storeResponse.ok) {
      res.status(storeResponse.status).json({
        message: "Product not found",
      });
      return;
    }

    const storeData = await storeResponse.json();
    const product = storeData.product;

    if (!product) {
      res.status(404).json({
        message: "Product not found",
      });
      return;
    }

    // Now get metadata from admin API (which does return metadata)
    let metadata = {};
    try {
      // We need admin token for admin API - but we can try without it first
      // Or we can use the product service from scope
      const adminResponse = await fetch(`${backendUrl}/admin/products/${id}`, {
        headers: {
          "Content-Type": "application/json",
          // Admin API might need auth, but let's try
        },
      });

      if (adminResponse.ok) {
        const adminData = await adminResponse.json();
        if (adminData.product?.metadata) {
          metadata = adminData.product.metadata;
        }
      }
    } catch (adminError) {
      // Admin API failed, continue without metadata
      console.log("Could not fetch from admin API");
    }

    // Return product with metadata
    res.json({
      product: {
        ...product,
        metadata: metadata,
      },
    });
  } catch (error) {
    console.error("Error fetching product metadata:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
