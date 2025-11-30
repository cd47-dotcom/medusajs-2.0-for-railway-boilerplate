import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { IProductModuleService } from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'

// Handle CORS preflight requests
export async function OPTIONS(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  res.status(200).end()
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  try {
    const productModuleService: IProductModuleService = req.scope.resolve(
      Modules.PRODUCT
    )

    // Use list with filter to get the product
    const [products] = await productModuleService.list({
      id: [id],
    })

    if (!products || products.length === 0) {
      res.status(404).json({
        message: "Product not found",
      })
      return
    }

    const product = products[0]

    // Return product with metadata
    res.json({
      product: {
        ...product,
        metadata: product.metadata || {},
      },
    })
  } catch (error) {
    console.error("Error fetching product metadata:", error)
    res.status(404).json({
      message: "Product not found",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

