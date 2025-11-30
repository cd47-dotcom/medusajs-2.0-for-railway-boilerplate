import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
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
    // Get product module service (without strict typing to avoid build errors)
    const productModuleService: any = req.scope.resolve(Modules.PRODUCT)

    // Try different method names that might exist
    let product
    
    // Try listAndCount first (most common)
    if (typeof productModuleService.listAndCount === 'function') {
      const [products] = await productModuleService.listAndCount({ id: [id] })
      product = products?.[0]
    }
    // Fallback to retrieve if available
    else if (typeof productModuleService.retrieve === 'function') {
      product = await productModuleService.retrieve(id)
    }
    // Fallback to list if available
    else if (typeof productModuleService.list === 'function') {
      const products = await productModuleService.list({ id: [id] })
      product = products?.[0]
    }

    if (!product) {
      res.status(404).json({
        message: "Product not found",
      })
      return
    }

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

