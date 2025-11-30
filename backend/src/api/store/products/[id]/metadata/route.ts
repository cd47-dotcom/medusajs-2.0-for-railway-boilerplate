import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";

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

  // Simple approach: Call the store API internally to get the product
  // Then we'll add metadata from the database
  const backendUrl = getBackendUrl();

  try {
    // First, get the product from store API
    const storeResponse = await fetch(`${backendUrl}/store/products/${id}`, {
      headers: {
        "Content-Type": "application/json",
        // Forward the publishable key if present
        ...(req.headers["x-publishable-api-key"]
          ? {
              "x-publishable-api-key": req.headers[
                "x-publishable-api-key"
              ] as string,
            }
          : {}),
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

    // Now try to get metadata from the product service or database
    // The store API doesn't return metadata, so we need to get it separately
    let metadata = product.metadata || {};

    // Try to resolve product service to get metadata
    try {
      const productModuleService: any = req.scope.resolve(Modules.PRODUCT);

      // Try to get product with metadata
      if (typeof productModuleService?.listAndCount === "function") {
        const [products] = await productModuleService.listAndCount({
          id: [id],
        });
        if (products?.[0]?.metadata) {
          metadata = products[0].metadata;
          console.log("Got metadata from product service:", metadata);
        }
      }
    } catch (serviceError: any) {
      console.log("Could not get metadata from service:", serviceError.message);
      // Continue with empty metadata - at least we have the product
    }

    // Return product with metadata
    res.json({
      product: {
        ...product,
        metadata: metadata,
      },
    });
    return;
  } catch (error) {
    console.error("Error in metadata endpoint:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return;
  }
}
