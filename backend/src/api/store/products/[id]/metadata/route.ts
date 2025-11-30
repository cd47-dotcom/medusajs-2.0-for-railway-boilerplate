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
    // Debug: Check what's in scope
    console.log("Available scope keys:", Object.keys(req.scope || {}));
    console.log("Modules.PRODUCT value:", Modules.PRODUCT);

    // Try to resolve product service
    let productModuleService: any;
    try {
      productModuleService = req.scope.resolve(Modules.PRODUCT);
      console.log("Successfully resolved product service");
    } catch (resolveError: any) {
      console.error("Failed to resolve Modules.PRODUCT:", resolveError.message);
      // Try alternative resolution methods
      try {
        productModuleService = req.scope.resolve("productService");
        console.log("Resolved via 'productService' string");
      } catch (e2: any) {
        console.error("Failed to resolve 'productService':", e2.message);
        try {
          productModuleService = req.scope.resolve("product");
          console.log("Resolved via 'product' string");
        } catch (e3: any) {
          console.error("Failed to resolve 'product':", e3.message);
        }
      }
    }

    console.log(
      "Product service methods:",
      productModuleService
        ? Object.keys(productModuleService)
        : "null/undefined"
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

    // If still no product, try to get just metadata from database directly
    if (!product && productModuleService) {
      console.log("Trying to get metadata directly from product service");
      // The product service might have a different structure
      // Try to inspect what we actually got
      console.log("Product service type:", typeof productModuleService);
      console.log(
        "Product service constructor:",
        productModuleService?.constructor?.name
      );

      // Maybe it's a query builder or has a different API
      if (typeof productModuleService === "object") {
        // Try to find any method that might work
        const allMethods = Object.getOwnPropertyNames(
          Object.getPrototypeOf(productModuleService)
        ).filter(
          (name) =>
            name !== "constructor" &&
            typeof productModuleService[name] === "function"
        );
        console.log("All prototype methods:", allMethods);
      }
    }

    if (!product) {
      console.error("All methods failed. Error:", errorMessage);
      console.error(
        "Product service was:",
        productModuleService ? "resolved" : "null/undefined"
      );
      res.status(404).json({
        message: "Product not found",
        error: errorMessage || "No product found with any method",
        availableMethods: productModuleService
          ? Object.keys(productModuleService).filter(
              (key) => typeof productModuleService[key] === "function"
            )
          : [],
        scopeKeys: Object.keys(req.scope || {}).slice(0, 10), // First 10 keys for debugging
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
