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
    let product;
    try {
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
        console.error(`Store API returned ${storeResponse.status}`);
        res.status(storeResponse.status).json({
          message: "Product not found",
        });
        return;
      }

      const storeData = await storeResponse.json();
      product = storeData.product;
    } catch (fetchError: any) {
      console.error("Failed to fetch from store API:", fetchError.message);
      res.status(500).json({
        message: "Failed to fetch product",
        error: fetchError.message,
      });
      return;
    }

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

    // Fallback: Direct database query if metadata is still empty
    if (Object.keys(metadata).length === 0) {
      try {
        console.log("Attempting direct database query for metadata");

        // Try to resolve manager/entityManager from scope
        const possibleManagerKeys = ["manager", "entityManager", "em", "db"];
        let manager: any = null;

        for (const key of possibleManagerKeys) {
          try {
            manager = req.scope.resolve(key);
            console.log(`Resolved manager via key: ${key}`);
            break;
          } catch (e: any) {
            console.log(`Could not resolve '${key}':`, e.message);
          }
        }

        if (manager) {
          // Try raw SQL query - check multiple possible table/column names
          if (typeof manager.query === "function") {
            console.log("Trying raw SQL query");

            // Try different table/column combinations
            const queries = [
              `SELECT metadata FROM product WHERE id = $1`,
              `SELECT metadata FROM product_product WHERE id = $1`,
              `SELECT metadata::jsonb FROM product WHERE id = $1`,
            ];

            for (const query of queries) {
              try {
                const result = await manager.query(query, [id]);
                if (result?.[0]?.metadata) {
                  // Handle JSONB string if needed
                  const meta = result[0].metadata;
                  metadata = typeof meta === "string" ? JSON.parse(meta) : meta;
                  console.log("✅ Got metadata from raw SQL query:", metadata);
                  break;
                }
              } catch (queryError: any) {
                console.log(`Query failed: ${query}`, queryError.message);
              }
            }
          }

          // Try MikroORM findOne
          if (
            Object.keys(metadata).length === 0 &&
            typeof manager.findOne === "function"
          ) {
            console.log("Trying MikroORM findOne");
            const productEntity = await manager.findOne("Product", { id });
            if (productEntity?.metadata) {
              metadata = productEntity.metadata;
              console.log("✅ Got metadata from MikroORM:", metadata);
            }
          }

          // Try Knex-style query
          if (
            Object.keys(metadata).length === 0 &&
            typeof manager.select === "function"
          ) {
            console.log("Trying Knex-style query");
            const result = await manager("product")
              .select("metadata")
              .where("id", id)
              .first();
            if (result?.metadata) {
              metadata = result.metadata;
              console.log("✅ Got metadata from Knex query:", metadata);
            }
          }
        } else {
          console.log("Could not resolve database manager");
        }
      } catch (dbError: any) {
        console.error("Database query error:", dbError.message);
        console.error("Database error stack:", dbError.stack);
      }
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
