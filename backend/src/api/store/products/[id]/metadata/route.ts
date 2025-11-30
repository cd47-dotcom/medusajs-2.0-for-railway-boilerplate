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

  try {
    // Get product module service (without strict typing to avoid build errors)
    const productModuleService: any = req.scope.resolve(Modules.PRODUCT);

    console.log(
      "Product service methods:",
      Object.keys(productModuleService || {})
    );

    // Try different method names that might exist
    let product;
    let errorMessage = "";

    // Try listAndCount first (most common)
    if (typeof productModuleService.listAndCount === "function") {
      try {
        console.log("Trying listAndCount with id:", id);
        // Try different filter formats
        const result1 = await productModuleService.listAndCount({ id: [id] });
        console.log("listAndCount result (array filter):", result1);
        let [products] = result1;

        if (!products || products.length === 0) {
          // Try with object filter
          const result2 = await productModuleService.listAndCount({ id });
          console.log("listAndCount result (direct id):", result2);
          [products] = result2;
        }

        product = products?.[0];
        if (!product) {
          errorMessage = "listAndCount returned empty array";
        }
      } catch (e: any) {
        errorMessage = `listAndCount error: ${e.message}`;
        console.error(errorMessage);
      }
    }
    // Fallback to retrieve if available
    if (!product && typeof productModuleService.retrieve === "function") {
      try {
        console.log("Trying retrieve with id:", id);
        product = await productModuleService.retrieve(id);
        console.log("retrieve result:", product ? "found" : "not found");
      } catch (e: any) {
        errorMessage = `retrieve error: ${e.message}`;
        console.error(errorMessage);
      }
    }
    // Fallback to list if available
    if (!product && typeof productModuleService.list === "function") {
      try {
        console.log("Trying list with id:", id);
        const products = await productModuleService.list({ id: [id] });
        product = products?.[0];
        if (!product) {
          errorMessage = "list returned empty array";
        }
      } catch (e: any) {
        errorMessage = `list error: ${e.message}`;
        console.error(errorMessage);
      }
    }

    // If product service methods failed, try calling store API internally
    if (!product) {
      console.log(
        "Product service methods failed, trying internal store API call"
      );
      try {
        const backendUrl = getBackendUrl();
        const storeResponse = await fetch(
          `${backendUrl}/store/products/${id}`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (storeResponse.ok) {
          const storeData = await storeResponse.json();
          product = storeData.product;
          console.log(
            "Got product from store API, metadata:",
            product?.metadata
          );
        }
      } catch (fetchError) {
        console.error("Store API fetch failed:", fetchError);
      }
    }

    if (!product) {
      console.error("All methods failed. Error:", errorMessage);
      res.status(404).json({
        message: "Product not found",
        error: errorMessage || "No product found with any method",
        availableMethods: Object.keys(productModuleService || {}).filter(
          (key) => typeof productModuleService[key] === "function"
        ),
      });
      return;
    }

    console.log("Product found, metadata:", product.metadata);

    // Return product with metadata
    res.json({
      product: {
        ...product,
        metadata: product.metadata || {},
      },
    });
  } catch (error) {
    console.error("Error fetching product metadata:", error);
    res.status(404).json({
      message: "Product not found",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
