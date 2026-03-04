#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// Shopify configuration from environment variables
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE_DOMAIN) {
  console.error('Error: Missing environment variables (SHOPIFY_ACCESS_TOKEN, SHOPIFY_STORE_DOMAIN)');
  console.error('See README.md for configuration instructions.');
  process.exit(1);
}

/**
 * Helper function to make Shopify Admin API calls
 * @param {string} endpoint - API endpoint (e.g., '/products.json')
 * @param {object} options - Fetch options (method, body, etc.)
 * @returns {Promise<object>} API response as JSON
 */
async function shopifyApiCall(endpoint, options = {}, retries = 2) {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
  const headers = {
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json',
    ...options.headers
  };

  try {
    const response = await fetch(url, { ...options, headers });

    // Handle rate limiting (429 Too Many Requests)
    if (response.status === 429 && retries > 0) {
      const retryAfter = parseFloat(response.headers.get('Retry-After')) || 2;
      console.error(`Rate limited. Retrying in ${retryAfter}s...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return shopifyApiCall(endpoint, options, retries - 1);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API Error (${response.status}): ${errorText}`);
    }

    // Handle empty responses (DELETE operations return empty body)
    const text = await response.text();
    if (!text || text.trim() === '') {
      return {};
    }
    return JSON.parse(text);
  } catch (error) {
    if (error.message.startsWith('Shopify API Error')) throw error;
    throw new Error(`Shopify API call failed: ${error.message}`);
  }
}

// Create the MCP server
const server = new Server(
  {
    name: 'shopify-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================
// TOOL DEFINITIONS
// ============================================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ──────────── SHOP ────────────
      {
        name: 'shopify_get_shop',
        description: 'Get shop information (name, domain, currency, timezone, plan, etc.)',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },

      // ──────────── PRODUCTS ────────────
      {
        name: 'shopify_list_products',
        description: 'List products with pagination and filtering',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of products to return (default: 50, max: 250)',
              default: 50
            },
            page_info: {
              type: 'string',
              description: 'Cursor for pagination (from previous response)'
            },
            collection_id: {
              type: 'number',
              description: 'Filter by collection ID'
            },
            product_type: {
              type: 'string',
              description: 'Filter by product type'
            },
            vendor: {
              type: 'string',
              description: 'Filter by vendor name'
            },
            status: {
              type: 'string',
              description: 'Filter by status: active, archived, draft',
              default: 'active'
            },
            title: {
              type: 'string',
              description: 'Filter by title (partial match)'
            }
          }
        }
      },
      {
        name: 'shopify_get_product',
        description: 'Get a single product by ID with full details including variants and images',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Product ID'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_create_product',
        description: 'Create a new product',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Product title'
            },
            body_html: {
              type: 'string',
              description: 'Product description (HTML supported)'
            },
            vendor: {
              type: 'string',
              description: 'Product vendor'
            },
            product_type: {
              type: 'string',
              description: 'Product type/category'
            },
            status: {
              type: 'string',
              description: 'Product status: active, archived, draft',
              default: 'draft'
            },
            tags: {
              type: 'string',
              description: 'Comma-separated tags'
            },
            variants: {
              type: 'array',
              description: 'Product variants with price, sku, inventory, etc.',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  price: { type: 'string' },
                  sku: { type: 'string' },
                  inventory_quantity: { type: 'number' },
                  weight: { type: 'number' },
                  weight_unit: { type: 'string' }
                }
              }
            },
            images: {
              type: 'array',
              description: 'Product images (URLs)',
              items: {
                type: 'object',
                properties: {
                  src: { type: 'string', description: 'Image URL' },
                  alt: { type: 'string', description: 'Alt text' }
                }
              }
            }
          },
          required: ['title']
        }
      },
      {
        name: 'shopify_update_product',
        description: 'Update an existing product',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Product ID to update'
            },
            title: { type: 'string', description: 'New title' },
            body_html: { type: 'string', description: 'New description (HTML)' },
            vendor: { type: 'string', description: 'New vendor' },
            product_type: { type: 'string', description: 'New product type' },
            status: { type: 'string', description: 'New status: active, archived, draft' },
            tags: { type: 'string', description: 'New comma-separated tags' },
            variants: { type: 'array', description: 'Updated variants', items: { type: 'object' } },
            images: { type: 'array', description: 'Updated images', items: { type: 'object' } }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_delete_product',
        description: 'Delete a product by ID (irreversible)',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Product ID to delete'
            }
          },
          required: ['id']
        }
      },

      // ──────────── ORDERS ────────────
      {
        name: 'shopify_list_orders',
        description: 'List orders with pagination and filtering',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of orders (default: 50, max: 250)',
              default: 50
            },
            status: {
              type: 'string',
              description: 'Filter by status: open, closed, cancelled, any',
              default: 'any'
            },
            financial_status: {
              type: 'string',
              description: 'Filter: authorized, pending, paid, partially_paid, refunded, voided, any'
            },
            fulfillment_status: {
              type: 'string',
              description: 'Filter: shipped, partial, unshipped, unfulfilled, any'
            },
            created_at_min: {
              type: 'string',
              description: 'Minimum creation date (ISO 8601 format)'
            },
            created_at_max: {
              type: 'string',
              description: 'Maximum creation date (ISO 8601 format)'
            }
          }
        }
      },
      {
        name: 'shopify_get_order',
        description: 'Get a single order by ID with full details (line items, shipping, billing)',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Order ID'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_update_order',
        description: 'Update an order (notes, tags, shipping address, email)',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Order ID to update' },
            note: { type: 'string', description: 'Order note' },
            tags: { type: 'string', description: 'Comma-separated tags' },
            email: { type: 'string', description: 'Customer email' },
            shipping_address: {
              type: 'object',
              description: 'Updated shipping address',
              properties: {
                first_name: { type: 'string' },
                last_name: { type: 'string' },
                address1: { type: 'string' },
                address2: { type: 'string' },
                city: { type: 'string' },
                province: { type: 'string' },
                country: { type: 'string' },
                zip: { type: 'string' },
                phone: { type: 'string' }
              }
            }
          },
          required: ['id']
        }
      },

      // ──────────── CUSTOMERS ────────────
      {
        name: 'shopify_list_customers',
        description: 'List customers with pagination and filtering',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of customers (default: 50, max: 250)',
              default: 50
            },
            created_at_min: {
              type: 'string',
              description: 'Minimum creation date (ISO 8601)'
            },
            updated_at_min: {
              type: 'string',
              description: 'Minimum update date (ISO 8601)'
            }
          }
        }
      },
      {
        name: 'shopify_get_customer',
        description: 'Get a single customer by ID with full details and order history',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Customer ID'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_create_customer',
        description: 'Create a new customer',
        inputSchema: {
          type: 'object',
          properties: {
            first_name: { type: 'string', description: 'First name' },
            last_name: { type: 'string', description: 'Last name' },
            email: { type: 'string', description: 'Email address' },
            phone: { type: 'string', description: 'Phone number' },
            tags: { type: 'string', description: 'Comma-separated tags' },
            note: { type: 'string', description: 'Internal note about the customer' },
            addresses: {
              type: 'array',
              description: 'Customer addresses',
              items: {
                type: 'object',
                properties: {
                  address1: { type: 'string' },
                  address2: { type: 'string' },
                  city: { type: 'string' },
                  province: { type: 'string' },
                  country: { type: 'string' },
                  zip: { type: 'string' },
                  phone: { type: 'string' }
                }
              }
            }
          },
          required: ['email']
        }
      },
      {
        name: 'shopify_update_customer',
        description: 'Update an existing customer',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Customer ID' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            tags: { type: 'string' },
            note: { type: 'string' }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_search_customers',
        description: 'Search customers by query (name, email, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (searches name, email, phone, etc.)'
            },
            limit: {
              type: 'number',
              description: 'Number of results (default: 50)',
              default: 50
            }
          },
          required: ['query']
        }
      },

      // ──────────── DRAFT ORDERS ────────────
      {
        name: 'shopify_list_draft_orders',
        description: 'List draft orders with pagination',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of draft orders (default: 50, max: 250)',
              default: 50
            },
            status: {
              type: 'string',
              description: 'Filter: open, invoice_sent, completed',
              default: 'open'
            }
          }
        }
      },
      {
        name: 'shopify_create_draft_order',
        description: 'Create a new draft order',
        inputSchema: {
          type: 'object',
          properties: {
            line_items: {
              type: 'array',
              description: 'Line items for the draft order',
              items: {
                type: 'object',
                properties: {
                  variant_id: { type: 'number', description: 'Product variant ID' },
                  quantity: { type: 'number', description: 'Quantity' },
                  title: { type: 'string', description: 'Custom title (if no variant_id)' },
                  price: { type: 'string', description: 'Custom price (if no variant_id)' }
                }
              }
            },
            customer: {
              type: 'object',
              description: 'Customer info',
              properties: {
                id: { type: 'number', description: 'Existing customer ID' }
              }
            },
            note: { type: 'string', description: 'Order note' },
            tags: { type: 'string', description: 'Comma-separated tags' },
            shipping_address: {
              type: 'object',
              description: 'Shipping address'
            }
          },
          required: ['line_items']
        }
      },
      {
        name: 'shopify_complete_draft_order',
        description: 'Complete (finalize) a draft order, turning it into a real order',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Draft order ID to complete'
            },
            payment_pending: {
              type: 'boolean',
              description: 'If true, order is marked as pending payment (default: false)',
              default: false
            }
          },
          required: ['id']
        }
      },

      // ──────────── COLLECTIONS ────────────
      {
        name: 'shopify_list_collections',
        description: 'List all collections (custom and smart)',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of collections (default: 50)',
              default: 50
            },
            type: {
              type: 'string',
              description: 'Collection type: custom, smart, or all (default: all)',
              default: 'all'
            }
          }
        }
      },

      // ──────────── METAFIELDS ────────────
      {
        name: 'shopify_get_metafields',
        description: 'Get metafields for a resource (product, order, customer, collection, shop)',
        inputSchema: {
          type: 'object',
          properties: {
            resource: {
              type: 'string',
              description: 'Resource type: products, orders, customers, collections, shop'
            },
            resource_id: {
              type: 'number',
              description: 'Resource ID (not needed for shop)'
            },
            namespace: {
              type: 'string',
              description: 'Filter by namespace'
            }
          },
          required: ['resource']
        }
      },
      {
        name: 'shopify_set_metafield',
        description: 'Create or update a metafield on a resource',
        inputSchema: {
          type: 'object',
          properties: {
            resource: {
              type: 'string',
              description: 'Resource type: products, orders, customers, collections, shop'
            },
            resource_id: {
              type: 'number',
              description: 'Resource ID (not needed for shop)'
            },
            namespace: {
              type: 'string',
              description: 'Metafield namespace (e.g., "custom", "my_app")'
            },
            key: {
              type: 'string',
              description: 'Metafield key'
            },
            value: {
              type: 'string',
              description: 'Metafield value'
            },
            type: {
              type: 'string',
              description: 'Value type: single_line_text_field, multi_line_text_field, number_integer, number_decimal, boolean, json, url, date, etc.',
              default: 'single_line_text_field'
            }
          },
          required: ['resource', 'namespace', 'key', 'value']
        }
      },
      {
        name: 'shopify_delete_metafield',
        description: 'Delete a metafield by ID',
        inputSchema: {
          type: 'object',
          properties: {
            resource: {
              type: 'string',
              description: 'Resource type: products, orders, customers, collections, shop'
            },
            resource_id: {
              type: 'number',
              description: 'Resource ID (not needed for shop)'
            },
            metafield_id: {
              type: 'number',
              description: 'Metafield ID to delete'
            }
          },
          required: ['metafield_id']
        }
      },

      // ──────────── FULFILLMENTS ────────────
      {
        name: 'shopify_create_fulfillment',
        description: 'Create a fulfillment for an order (mark as shipped with optional tracking)',
        inputSchema: {
          type: 'object',
          properties: {
            order_id: {
              type: 'number',
              description: 'Order ID to fulfill'
            },
            tracking_number: {
              type: 'string',
              description: 'Shipping tracking number'
            },
            tracking_company: {
              type: 'string',
              description: 'Shipping carrier (e.g., "DHL", "UPS", "FedEx", "La Poste", "Bpost", "PostNL")'
            },
            tracking_url: {
              type: 'string',
              description: 'Tracking URL'
            },
            notify_customer: {
              type: 'boolean',
              description: 'Send notification email to customer (default: true)',
              default: true
            },
            line_items: {
              type: 'array',
              description: 'Specific line items to fulfill (omit for all items)',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number', description: 'Line item ID' },
                  quantity: { type: 'number', description: 'Quantity to fulfill' }
                }
              }
            }
          },
          required: ['order_id']
        }
      },
      {
        name: 'shopify_list_fulfillments',
        description: 'List fulfillments for an order',
        inputSchema: {
          type: 'object',
          properties: {
            order_id: {
              type: 'number',
              description: 'Order ID'
            }
          },
          required: ['order_id']
        }
      },

      // ──────────── DISCOUNTS / PRICE RULES ────────────
      {
        name: 'shopify_list_price_rules',
        description: 'List all price rules (discount rules)',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of price rules (default: 50)',
              default: 50
            }
          }
        }
      },
      {
        name: 'shopify_create_price_rule',
        description: 'Create a price rule (discount). Then create a discount code for it.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Price rule title (internal name)'
            },
            target_type: {
              type: 'string',
              description: 'What to discount: line_item (products) or shipping_line (shipping)',
              default: 'line_item'
            },
            target_selection: {
              type: 'string',
              description: 'Which items: all or entitled (specific products/collections)',
              default: 'all'
            },
            allocation_method: {
              type: 'string',
              description: 'How to allocate: across (spread) or each (per item)',
              default: 'across'
            },
            value_type: {
              type: 'string',
              description: 'Discount type: percentage or fixed_amount'
            },
            value: {
              type: 'string',
              description: 'Discount value (negative number, e.g., "-10.0" for 10% or 10EUR off)'
            },
            customer_selection: {
              type: 'string',
              description: 'Who can use: all or prerequisite (specific customers)',
              default: 'all'
            },
            starts_at: {
              type: 'string',
              description: 'Start date (ISO 8601). Required.'
            },
            ends_at: {
              type: 'string',
              description: 'End date (ISO 8601). Optional.'
            },
            usage_limit: {
              type: 'number',
              description: 'Maximum total uses (null for unlimited)'
            },
            once_per_customer: {
              type: 'boolean',
              description: 'Limit to one use per customer',
              default: false
            }
          },
          required: ['title', 'value_type', 'value', 'starts_at']
        }
      },
      {
        name: 'shopify_create_discount_code',
        description: 'Create a discount code for an existing price rule',
        inputSchema: {
          type: 'object',
          properties: {
            price_rule_id: {
              type: 'number',
              description: 'Price rule ID to attach the code to'
            },
            code: {
              type: 'string',
              description: 'The discount code (e.g., "SUMMER20", "BIENVENUE10")'
            }
          },
          required: ['price_rule_id', 'code']
        }
      },
      {
        name: 'shopify_delete_price_rule',
        description: 'Delete a price rule and its associated discount codes',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Price rule ID to delete'
            }
          },
          required: ['id']
        }
      },

      // ──────────── INVENTORY ADJUSTMENT ────────────
      {
        name: 'shopify_adjust_inventory',
        description: 'Adjust inventory level for an item at a location (add or remove stock)',
        inputSchema: {
          type: 'object',
          properties: {
            inventory_item_id: {
              type: 'number',
              description: 'Inventory item ID (found in product variants)'
            },
            location_id: {
              type: 'number',
              description: 'Location ID (use shopify_list_locations to find)'
            },
            available_adjustment: {
              type: 'number',
              description: 'Quantity to adjust (positive to add, negative to remove)'
            }
          },
          required: ['inventory_item_id', 'location_id', 'available_adjustment']
        }
      },
      {
        name: 'shopify_set_inventory',
        description: 'Set absolute inventory level for an item at a location',
        inputSchema: {
          type: 'object',
          properties: {
            inventory_item_id: {
              type: 'number',
              description: 'Inventory item ID'
            },
            location_id: {
              type: 'number',
              description: 'Location ID'
            },
            available: {
              type: 'number',
              description: 'New absolute quantity'
            }
          },
          required: ['inventory_item_id', 'location_id', 'available']
        }
      },

      // ──────────── ORDER CANCEL / CLOSE ────────────
      {
        name: 'shopify_cancel_order',
        description: 'Cancel an order (with optional refund and restock)',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Order ID to cancel'
            },
            reason: {
              type: 'string',
              description: 'Cancellation reason: customer, fraud, inventory, declined, other',
              default: 'other'
            },
            restock: {
              type: 'boolean',
              description: 'Restock the items (default: true)',
              default: true
            },
            email: {
              type: 'boolean',
              description: 'Send cancellation email to customer (default: true)',
              default: true
            }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_close_order',
        description: 'Close an order (mark as completed/archived)',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Order ID to close'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_reopen_order',
        description: 'Reopen a closed order',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Order ID to reopen'
            }
          },
          required: ['id']
        }
      },

      // ──────────── REFUNDS ────────────
      {
        name: 'shopify_calculate_refund',
        description: 'Calculate a refund for an order (preview before creating)',
        inputSchema: {
          type: 'object',
          properties: {
            order_id: {
              type: 'number',
              description: 'Order ID'
            },
            refund_line_items: {
              type: 'array',
              description: 'Line items to refund',
              items: {
                type: 'object',
                properties: {
                  line_item_id: { type: 'number', description: 'Line item ID' },
                  quantity: { type: 'number', description: 'Quantity to refund' },
                  restock_type: { type: 'string', description: 'Restock type: no_restock, cancel, return', default: 'return' }
                }
              }
            },
            shipping: {
              type: 'object',
              description: 'Shipping refund amount',
              properties: {
                full_refund: { type: 'boolean', description: 'Refund full shipping cost' },
                amount: { type: 'string', description: 'Specific shipping refund amount' }
              }
            }
          },
          required: ['order_id']
        }
      },
      {
        name: 'shopify_create_refund',
        description: 'Create a refund for an order (use calculate_refund first to preview)',
        inputSchema: {
          type: 'object',
          properties: {
            order_id: {
              type: 'number',
              description: 'Order ID'
            },
            note: {
              type: 'string',
              description: 'Refund note/reason'
            },
            notify: {
              type: 'boolean',
              description: 'Send refund notification to customer (default: true)',
              default: true
            },
            refund_line_items: {
              type: 'array',
              description: 'Line items to refund',
              items: {
                type: 'object',
                properties: {
                  line_item_id: { type: 'number' },
                  quantity: { type: 'number' },
                  restock_type: { type: 'string', default: 'return' }
                }
              }
            },
            shipping: {
              type: 'object',
              description: 'Shipping refund',
              properties: {
                full_refund: { type: 'boolean' },
                amount: { type: 'string' }
              }
            }
          },
          required: ['order_id']
        }
      },

      // ──────────── INVENTORY (read) ────────────
      {
        name: 'shopify_get_inventory',
        description: 'Get inventory levels for a product or location',
        inputSchema: {
          type: 'object',
          properties: {
            inventory_item_ids: {
              type: 'string',
              description: 'Comma-separated inventory item IDs'
            },
            location_ids: {
              type: 'string',
              description: 'Comma-separated location IDs'
            }
          }
        }
      },
      {
        name: 'shopify_list_locations',
        description: 'List all store locations (warehouses, stores, etc.)',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },

      // ──────────── PAGES (CMS) ────────────
      {
        name: 'shopify_list_pages',
        description: 'List CMS pages (About, FAQ, Contact, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of pages (default: 50)', default: 50 },
            published_status: { type: 'string', description: 'Filter: published, unpublished, any', default: 'any' }
          }
        }
      },
      {
        name: 'shopify_get_page',
        description: 'Get a single page by ID with full content',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Page ID' }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_create_page',
        description: 'Create a new CMS page',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Page title' },
            body_html: { type: 'string', description: 'Page content (HTML)' },
            handle: { type: 'string', description: 'URL handle (slug)' },
            published: { type: 'boolean', description: 'Publish immediately (default: false)', default: false },
            template_suffix: { type: 'string', description: 'Theme template suffix (e.g., "contact", "faq")' }
          },
          required: ['title']
        }
      },
      {
        name: 'shopify_update_page',
        description: 'Update an existing CMS page',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Page ID' },
            title: { type: 'string', description: 'New title' },
            body_html: { type: 'string', description: 'New content (HTML)' },
            handle: { type: 'string', description: 'New URL handle' },
            published: { type: 'boolean', description: 'Published status' },
            template_suffix: { type: 'string' }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_delete_page',
        description: 'Delete a CMS page',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Page ID to delete' }
          },
          required: ['id']
        }
      },

      // ──────────── BLOG / ARTICLES ────────────
      {
        name: 'shopify_list_blogs',
        description: 'List all blogs',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'shopify_list_articles',
        description: 'List articles from a blog',
        inputSchema: {
          type: 'object',
          properties: {
            blog_id: { type: 'number', description: 'Blog ID' },
            limit: { type: 'number', description: 'Number of articles (default: 50)', default: 50 },
            published_status: { type: 'string', description: 'Filter: published, unpublished, any', default: 'any' },
            tag: { type: 'string', description: 'Filter by tag' }
          },
          required: ['blog_id']
        }
      },
      {
        name: 'shopify_get_article',
        description: 'Get a single blog article with full content',
        inputSchema: {
          type: 'object',
          properties: {
            blog_id: { type: 'number', description: 'Blog ID' },
            article_id: { type: 'number', description: 'Article ID' }
          },
          required: ['blog_id', 'article_id']
        }
      },
      {
        name: 'shopify_create_article',
        description: 'Create a new blog article',
        inputSchema: {
          type: 'object',
          properties: {
            blog_id: { type: 'number', description: 'Blog ID to publish to' },
            title: { type: 'string', description: 'Article title' },
            body_html: { type: 'string', description: 'Article content (HTML)' },
            author: { type: 'string', description: 'Author name' },
            tags: { type: 'string', description: 'Comma-separated tags' },
            summary_html: { type: 'string', description: 'Article summary/excerpt (HTML)' },
            handle: { type: 'string', description: 'URL handle (slug)' },
            published: { type: 'boolean', description: 'Publish immediately', default: false },
            image: {
              type: 'object',
              description: 'Featured image',
              properties: {
                src: { type: 'string', description: 'Image URL' },
                alt: { type: 'string', description: 'Alt text' }
              }
            }
          },
          required: ['blog_id', 'title', 'body_html']
        }
      },
      {
        name: 'shopify_update_article',
        description: 'Update an existing blog article',
        inputSchema: {
          type: 'object',
          properties: {
            blog_id: { type: 'number', description: 'Blog ID' },
            article_id: { type: 'number', description: 'Article ID' },
            title: { type: 'string' },
            body_html: { type: 'string' },
            author: { type: 'string' },
            tags: { type: 'string' },
            summary_html: { type: 'string' },
            handle: { type: 'string' },
            published: { type: 'boolean' }
          },
          required: ['blog_id', 'article_id']
        }
      },

      // ──────────── COLLECTIONS CRUD ────────────
      {
        name: 'shopify_create_collection',
        description: 'Create a custom collection',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Collection title' },
            body_html: { type: 'string', description: 'Collection description (HTML)' },
            handle: { type: 'string', description: 'URL handle' },
            published: { type: 'boolean', description: 'Publish immediately', default: true },
            image: {
              type: 'object',
              description: 'Collection image',
              properties: {
                src: { type: 'string' },
                alt: { type: 'string' }
              }
            },
            sort_order: { type: 'string', description: 'Sort order: alpha-asc, alpha-desc, best-selling, created, created-desc, manual, price-asc, price-desc' }
          },
          required: ['title']
        }
      },
      {
        name: 'shopify_update_collection',
        description: 'Update a custom collection',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Collection ID' },
            title: { type: 'string' },
            body_html: { type: 'string' },
            handle: { type: 'string' },
            published: { type: 'boolean' },
            sort_order: { type: 'string' }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_delete_collection',
        description: 'Delete a custom collection',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Collection ID to delete' }
          },
          required: ['id']
        }
      },
      {
        name: 'shopify_add_product_to_collection',
        description: 'Add a product to a custom collection',
        inputSchema: {
          type: 'object',
          properties: {
            collection_id: { type: 'number', description: 'Collection ID' },
            product_id: { type: 'number', description: 'Product ID to add' }
          },
          required: ['collection_id', 'product_id']
        }
      },
      {
        name: 'shopify_remove_product_from_collection',
        description: 'Remove a product from a custom collection',
        inputSchema: {
          type: 'object',
          properties: {
            collection_id: { type: 'number', description: 'Collection ID' },
            product_id: { type: 'number', description: 'Product ID to remove' }
          },
          required: ['collection_id', 'product_id']
        }
      },

      // ──────────── URL REDIRECTS ────────────
      {
        name: 'shopify_list_redirects',
        description: 'List URL redirects (301 redirections)',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of redirects (default: 50)', default: 50 },
            path: { type: 'string', description: 'Filter by source path' },
            target: { type: 'string', description: 'Filter by target path' }
          }
        }
      },
      {
        name: 'shopify_create_redirect',
        description: 'Create a URL redirect (301)',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Source URL path (e.g., "/old-page")' },
            target: { type: 'string', description: 'Target URL path (e.g., "/new-page")' }
          },
          required: ['path', 'target']
        }
      },
      {
        name: 'shopify_delete_redirect',
        description: 'Delete a URL redirect',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Redirect ID to delete' }
          },
          required: ['id']
        }
      },

      // ──────────── WEBHOOKS ────────────
      {
        name: 'shopify_list_webhooks',
        description: 'List registered webhooks',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of webhooks (default: 50)', default: 50 },
            topic: { type: 'string', description: 'Filter by topic (e.g., "orders/create")' }
          }
        }
      },
      {
        name: 'shopify_create_webhook',
        description: 'Register a new webhook',
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'Event topic: orders/create, orders/updated, orders/cancelled, products/create, products/update, products/delete, customers/create, customers/update, carts/create, carts/update, checkouts/create, fulfillments/create, refunds/create, app/uninstalled, etc.'
            },
            address: { type: 'string', description: 'Webhook delivery URL (HTTPS)' },
            format: { type: 'string', description: 'Payload format: json or xml', default: 'json' }
          },
          required: ['topic', 'address']
        }
      },
      {
        name: 'shopify_delete_webhook',
        description: 'Delete a webhook',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Webhook ID to delete' }
          },
          required: ['id']
        }
      },

      // ──────────── ABANDONED CHECKOUTS ────────────
      {
        name: 'shopify_list_abandoned_checkouts',
        description: 'List abandoned checkouts (customers who started but did not complete purchase)',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of checkouts (default: 50)', default: 50 },
            status: { type: 'string', description: 'Filter: open, closed', default: 'open' },
            created_at_min: { type: 'string', description: 'Minimum creation date (ISO 8601)' },
            created_at_max: { type: 'string', description: 'Maximum creation date (ISO 8601)' }
          }
        }
      },

      // ──────────── TRANSACTIONS ────────────
      {
        name: 'shopify_list_transactions',
        description: 'List payment transactions for an order',
        inputSchema: {
          type: 'object',
          properties: {
            order_id: { type: 'number', description: 'Order ID' }
          },
          required: ['order_id']
        }
      }
    ]
  };
});

// ============================================================
// TOOL EXECUTION
// ============================================================
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      // ──────────── SHOP ────────────
      case 'shopify_get_shop': {
        const data = await shopifyApiCall('/shop.json');
        const s = data.shop;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: s.id,
              name: s.name,
              email: s.email,
              domain: s.domain,
              myshopify_domain: s.myshopify_domain,
              currency: s.currency,
              money_format: s.money_format,
              timezone: s.timezone,
              plan_name: s.plan_name,
              country_name: s.country_name,
              province: s.province,
              city: s.city,
              phone: s.phone,
              created_at: s.created_at,
              updated_at: s.updated_at
            }, null, 2)
          }]
        };
      }

      // ──────────── PRODUCTS ────────────
      case 'shopify_list_products': {
        const { limit = 50, page_info, collection_id, product_type, vendor, status = 'active', title } = args;

        let endpoint;
        if (page_info) {
          // Cursor-based pagination: only limit and page_info allowed
          endpoint = `/products.json?limit=${limit}&page_info=${page_info}`;
        } else {
          endpoint = `/products.json?limit=${limit}&status=${status}`;
          if (collection_id) endpoint += `&collection_id=${collection_id}`;
          if (product_type) endpoint += `&product_type=${encodeURIComponent(product_type)}`;
          if (vendor) endpoint += `&vendor=${encodeURIComponent(vendor)}`;
          if (title) endpoint += `&title=${encodeURIComponent(title)}`;
        }

        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.products.map(p => ({
              id: p.id,
              title: p.title,
              status: p.status,
              vendor: p.vendor,
              product_type: p.product_type,
              tags: p.tags,
              variants_count: p.variants.length,
              price_range: p.variants.length > 0
                ? `${Math.min(...p.variants.map(v => parseFloat(v.price)))} - ${Math.max(...p.variants.map(v => parseFloat(v.price)))}`
                : 'N/A',
              total_inventory: p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
              created_at: p.created_at,
              updated_at: p.updated_at
            })), null, 2)
          }]
        };
      }

      case 'shopify_get_product': {
        const { id } = args;
        const data = await shopifyApiCall(`/products/${id}.json`);
        const p = data.product;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: p.id,
              title: p.title,
              body_html: p.body_html,
              vendor: p.vendor,
              product_type: p.product_type,
              status: p.status,
              tags: p.tags,
              handle: p.handle,
              variants: p.variants.map(v => ({
                id: v.id,
                title: v.title,
                price: v.price,
                compare_at_price: v.compare_at_price,
                sku: v.sku,
                inventory_quantity: v.inventory_quantity,
                inventory_item_id: v.inventory_item_id,
                weight: v.weight,
                weight_unit: v.weight_unit
              })),
              images: p.images.map(i => ({
                id: i.id,
                src: i.src,
                alt: i.alt
              })),
              options: p.options,
              created_at: p.created_at,
              updated_at: p.updated_at
            }, null, 2)
          }]
        };
      }

      case 'shopify_create_product': {
        const { title, body_html, vendor, product_type, status = 'draft', tags, variants, images } = args;

        const productData = { title, status };
        if (body_html) productData.body_html = body_html;
        if (vendor) productData.vendor = vendor;
        if (product_type) productData.product_type = product_type;
        if (tags) productData.tags = tags;
        if (variants) productData.variants = variants;
        if (images) productData.images = images;

        const data = await shopifyApiCall('/products.json', {
          method: 'POST',
          body: JSON.stringify({ product: productData })
        });

        return {
          content: [{
            type: 'text',
            text: `Product created successfully!\n\nID: ${data.product.id}\nTitle: ${data.product.title}\nStatus: ${data.product.status}\nHandle: ${data.product.handle}\nVariants: ${data.product.variants.length}`
          }]
        };
      }

      case 'shopify_update_product': {
        const { id, ...updates } = args;

        const data = await shopifyApiCall(`/products/${id}.json`, {
          method: 'PUT',
          body: JSON.stringify({ product: { id, ...updates } })
        });

        return {
          content: [{
            type: 'text',
            text: `Product ${id} updated successfully!\n\nTitle: ${data.product.title}\nStatus: ${data.product.status}\nUpdated at: ${data.product.updated_at}`
          }]
        };
      }

      case 'shopify_delete_product': {
        const { id } = args;

        await shopifyApiCall(`/products/${id}.json`, { method: 'DELETE' });

        return {
          content: [{
            type: 'text',
            text: `Product ${id} deleted successfully.`
          }]
        };
      }

      // ──────────── ORDERS ────────────
      case 'shopify_list_orders': {
        const { limit = 50, status = 'any', financial_status, fulfillment_status, created_at_min, created_at_max } = args;

        let endpoint = `/orders.json?limit=${limit}&status=${status}`;
        if (financial_status) endpoint += `&financial_status=${financial_status}`;
        if (fulfillment_status) endpoint += `&fulfillment_status=${fulfillment_status}`;
        if (created_at_min) endpoint += `&created_at_min=${encodeURIComponent(created_at_min)}`;
        if (created_at_max) endpoint += `&created_at_max=${encodeURIComponent(created_at_max)}`;

        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.orders.map(o => ({
              id: o.id,
              order_number: o.order_number,
              name: o.name,
              email: o.email,
              financial_status: o.financial_status,
              fulfillment_status: o.fulfillment_status,
              total_price: o.total_price,
              currency: o.currency,
              line_items_count: o.line_items.length,
              created_at: o.created_at,
              customer: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : 'Guest'
            })), null, 2)
          }]
        };
      }

      case 'shopify_get_order': {
        const { id } = args;
        const data = await shopifyApiCall(`/orders/${id}.json`);
        const o = data.order;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: o.id,
              order_number: o.order_number,
              name: o.name,
              email: o.email,
              phone: o.phone,
              financial_status: o.financial_status,
              fulfillment_status: o.fulfillment_status,
              total_price: o.total_price,
              subtotal_price: o.subtotal_price,
              total_tax: o.total_tax,
              total_discounts: o.total_discounts,
              currency: o.currency,
              note: o.note,
              tags: o.tags,
              line_items: o.line_items.map(li => ({
                id: li.id,
                title: li.title,
                variant_title: li.variant_title,
                quantity: li.quantity,
                price: li.price,
                sku: li.sku
              })),
              shipping_address: o.shipping_address,
              billing_address: o.billing_address,
              customer: o.customer ? {
                id: o.customer.id,
                name: `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim(),
                email: o.customer.email
              } : null,
              created_at: o.created_at,
              updated_at: o.updated_at
            }, null, 2)
          }]
        };
      }

      case 'shopify_update_order': {
        const { id, ...updates } = args;

        const data = await shopifyApiCall(`/orders/${id}.json`, {
          method: 'PUT',
          body: JSON.stringify({ order: { id, ...updates } })
        });

        return {
          content: [{
            type: 'text',
            text: `Order ${id} updated successfully!\n\nOrder: ${data.order.name}\nStatus: ${data.order.financial_status}\nUpdated at: ${data.order.updated_at}`
          }]
        };
      }

      // ──────────── CUSTOMERS ────────────
      case 'shopify_list_customers': {
        const { limit = 50, created_at_min, updated_at_min } = args;

        let endpoint = `/customers.json?limit=${limit}`;
        if (created_at_min) endpoint += `&created_at_min=${encodeURIComponent(created_at_min)}`;
        if (updated_at_min) endpoint += `&updated_at_min=${encodeURIComponent(updated_at_min)}`;

        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.customers.map(c => ({
              id: c.id,
              name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
              email: c.email,
              phone: c.phone,
              orders_count: c.orders_count,
              total_spent: c.total_spent,
              tags: c.tags,
              state: c.state,
              created_at: c.created_at
            })), null, 2)
          }]
        };
      }

      case 'shopify_get_customer': {
        const { id } = args;
        const data = await shopifyApiCall(`/customers/${id}.json`);
        const c = data.customer;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: c.id,
              first_name: c.first_name,
              last_name: c.last_name,
              email: c.email,
              phone: c.phone,
              orders_count: c.orders_count,
              total_spent: c.total_spent,
              tags: c.tags,
              note: c.note,
              state: c.state,
              verified_email: c.verified_email,
              addresses: c.addresses,
              default_address: c.default_address,
              created_at: c.created_at,
              updated_at: c.updated_at
            }, null, 2)
          }]
        };
      }

      case 'shopify_create_customer': {
        const { first_name, last_name, email, phone, tags, note, addresses } = args;

        const customerData = { email };
        if (first_name) customerData.first_name = first_name;
        if (last_name) customerData.last_name = last_name;
        if (phone) customerData.phone = phone;
        if (tags) customerData.tags = tags;
        if (note) customerData.note = note;
        if (addresses) customerData.addresses = addresses;

        const data = await shopifyApiCall('/customers.json', {
          method: 'POST',
          body: JSON.stringify({ customer: customerData })
        });

        return {
          content: [{
            type: 'text',
            text: `Customer created successfully!\n\nID: ${data.customer.id}\nName: ${data.customer.first_name || ''} ${data.customer.last_name || ''}\nEmail: ${data.customer.email}`
          }]
        };
      }

      case 'shopify_update_customer': {
        const { id, ...updates } = args;

        const data = await shopifyApiCall(`/customers/${id}.json`, {
          method: 'PUT',
          body: JSON.stringify({ customer: { id, ...updates } })
        });

        return {
          content: [{
            type: 'text',
            text: `Customer ${id} updated successfully!\n\nName: ${data.customer.first_name || ''} ${data.customer.last_name || ''}\nEmail: ${data.customer.email}`
          }]
        };
      }

      case 'shopify_search_customers': {
        const { query, limit = 50 } = args;
        const endpoint = `/customers/search.json?query=${encodeURIComponent(query)}&limit=${limit}`;
        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.customers.map(c => ({
              id: c.id,
              name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
              email: c.email,
              phone: c.phone,
              orders_count: c.orders_count,
              total_spent: c.total_spent,
              tags: c.tags
            })), null, 2)
          }]
        };
      }

      // ──────────── DRAFT ORDERS ────────────
      case 'shopify_list_draft_orders': {
        const { limit = 50, status = 'open' } = args;
        const endpoint = `/draft_orders.json?limit=${limit}&status=${status}`;
        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.draft_orders.map(d => ({
              id: d.id,
              name: d.name,
              status: d.status,
              total_price: d.total_price,
              currency: d.currency,
              line_items_count: d.line_items.length,
              customer: d.customer ? `${d.customer.first_name || ''} ${d.customer.last_name || ''}`.trim() : 'No customer',
              created_at: d.created_at,
              updated_at: d.updated_at
            })), null, 2)
          }]
        };
      }

      case 'shopify_create_draft_order': {
        const { line_items, customer, note, tags, shipping_address } = args;

        const draftData = { line_items };
        if (customer) draftData.customer = customer;
        if (note) draftData.note = note;
        if (tags) draftData.tags = tags;
        if (shipping_address) draftData.shipping_address = shipping_address;

        const data = await shopifyApiCall('/draft_orders.json', {
          method: 'POST',
          body: JSON.stringify({ draft_order: draftData })
        });

        return {
          content: [{
            type: 'text',
            text: `Draft order created successfully!\n\nID: ${data.draft_order.id}\nName: ${data.draft_order.name}\nTotal: ${data.draft_order.total_price} ${data.draft_order.currency}\nStatus: ${data.draft_order.status}`
          }]
        };
      }

      case 'shopify_complete_draft_order': {
        const { id, payment_pending = false } = args;

        const data = await shopifyApiCall(`/draft_orders/${id}/complete.json?payment_pending=${payment_pending}`, {
          method: 'PUT'
        });

        return {
          content: [{
            type: 'text',
            text: `Draft order ${id} completed!\n\nOrder ID: ${data.draft_order.order_id}\nStatus: ${data.draft_order.status}\nName: ${data.draft_order.name}`
          }]
        };
      }

      // ──────────── COLLECTIONS ────────────
      case 'shopify_list_collections': {
        const { limit = 50, type = 'all' } = args;
        let collections = [];

        if (type === 'all' || type === 'custom') {
          const custom = await shopifyApiCall(`/custom_collections.json?limit=${limit}`);
          collections.push(...custom.custom_collections.map(c => ({ ...c, collection_type: 'custom' })));
        }

        if (type === 'all' || type === 'smart') {
          const smart = await shopifyApiCall(`/smart_collections.json?limit=${limit}`);
          collections.push(...smart.smart_collections.map(c => ({ ...c, collection_type: 'smart' })));
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(collections.map(c => ({
              id: c.id,
              title: c.title,
              handle: c.handle,
              collection_type: c.collection_type,
              body_html: c.body_html ? c.body_html.substring(0, 200) : null,
              published_at: c.published_at,
              updated_at: c.updated_at
            })), null, 2)
          }]
        };
      }

      // ──────────── METAFIELDS ────────────
      case 'shopify_get_metafields': {
        const { resource, resource_id, namespace } = args;
        let endpoint;
        if (resource === 'shop') {
          endpoint = '/metafields.json';
        } else {
          endpoint = `/${resource}/${resource_id}/metafields.json`;
        }
        if (namespace) endpoint += `?namespace=${encodeURIComponent(namespace)}`;

        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.metafields.map(m => ({
              id: m.id,
              namespace: m.namespace,
              key: m.key,
              value: m.value,
              type: m.type,
              owner_resource: m.owner_resource,
              owner_id: m.owner_id,
              created_at: m.created_at,
              updated_at: m.updated_at
            })), null, 2)
          }]
        };
      }

      case 'shopify_set_metafield': {
        const { resource, resource_id, namespace: ns, key, value, type: metaType = 'single_line_text_field' } = args;

        const metafieldData = {
          namespace: ns,
          key,
          value,
          type: metaType
        };

        let endpoint;
        if (resource === 'shop') {
          endpoint = '/metafields.json';
        } else {
          endpoint = `/${resource}/${resource_id}/metafields.json`;
        }

        const data = await shopifyApiCall(endpoint, {
          method: 'POST',
          body: JSON.stringify({ metafield: metafieldData })
        });

        return {
          content: [{
            type: 'text',
            text: `Metafield created/updated!\n\nID: ${data.metafield.id}\nNamespace: ${data.metafield.namespace}\nKey: ${data.metafield.key}\nValue: ${data.metafield.value}\nType: ${data.metafield.type}`
          }]
        };
      }

      case 'shopify_delete_metafield': {
        const { resource, resource_id, metafield_id } = args;

        let endpoint;
        if (resource === 'shop' || !resource) {
          endpoint = `/metafields/${metafield_id}.json`;
        } else {
          endpoint = `/${resource}/${resource_id}/metafields/${metafield_id}.json`;
        }

        await shopifyApiCall(endpoint, { method: 'DELETE' });

        return {
          content: [{
            type: 'text',
            text: `Metafield ${metafield_id} deleted successfully.`
          }]
        };
      }

      // ──────────── FULFILLMENTS ────────────
      case 'shopify_create_fulfillment': {
        const { order_id, tracking_number, tracking_company, tracking_url, notify_customer = true, line_items } = args;

        // First get fulfillment orders for this order
        const foData = await shopifyApiCall(`/orders/${order_id}/fulfillment_orders.json`);
        const fulfillmentOrders = foData.fulfillment_orders.filter(fo => fo.status === 'open');

        if (fulfillmentOrders.length === 0) {
          return {
            content: [{ type: 'text', text: 'No open fulfillment orders found for this order. It may already be fulfilled.' }]
          };
        }

        const fulfillmentData = {
          notify_customer,
          line_items_by_fulfillment_order: fulfillmentOrders.map(fo => ({
            fulfillment_order_id: fo.id,
            fulfillment_order_line_items: line_items
              ? fo.line_items.filter(li => line_items.some(l => l.id === li.line_item_id)).map(li => ({
                  id: li.id,
                  quantity: line_items.find(l => l.id === li.line_item_id)?.quantity || li.fulfillable_quantity
                }))
              : fo.line_items.map(li => ({ id: li.id, quantity: li.fulfillable_quantity }))
          }))
        };

        if (tracking_number || tracking_company || tracking_url) {
          fulfillmentData.tracking_info = {};
          if (tracking_number) fulfillmentData.tracking_info.number = tracking_number;
          if (tracking_company) fulfillmentData.tracking_info.company = tracking_company;
          if (tracking_url) fulfillmentData.tracking_info.url = tracking_url;
        }

        const data = await shopifyApiCall('/fulfillments.json', {
          method: 'POST',
          body: JSON.stringify({ fulfillment: fulfillmentData })
        });

        return {
          content: [{
            type: 'text',
            text: `Fulfillment created!\n\nID: ${data.fulfillment.id}\nStatus: ${data.fulfillment.status}\nTracking: ${data.fulfillment.tracking_number || 'None'}\nCarrier: ${data.fulfillment.tracking_company || 'None'}\nItems: ${data.fulfillment.line_items.length}`
          }]
        };
      }

      case 'shopify_list_fulfillments': {
        const { order_id } = args;
        const data = await shopifyApiCall(`/orders/${order_id}/fulfillments.json`);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.fulfillments.map(f => ({
              id: f.id,
              status: f.status,
              tracking_number: f.tracking_number,
              tracking_company: f.tracking_company,
              tracking_url: f.tracking_url,
              line_items_count: f.line_items.length,
              created_at: f.created_at,
              updated_at: f.updated_at
            })), null, 2)
          }]
        };
      }

      // ──────────── DISCOUNTS / PRICE RULES ────────────
      case 'shopify_list_price_rules': {
        const { limit = 50 } = args;
        const data = await shopifyApiCall(`/price_rules.json?limit=${limit}`);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.price_rules.map(pr => ({
              id: pr.id,
              title: pr.title,
              value_type: pr.value_type,
              value: pr.value,
              target_type: pr.target_type,
              customer_selection: pr.customer_selection,
              usage_limit: pr.usage_limit,
              once_per_customer: pr.once_per_customer,
              starts_at: pr.starts_at,
              ends_at: pr.ends_at,
              created_at: pr.created_at
            })), null, 2)
          }]
        };
      }

      case 'shopify_create_price_rule': {
        const {
          title, target_type = 'line_item', target_selection = 'all',
          allocation_method = 'across', value_type, value,
          customer_selection = 'all', starts_at, ends_at,
          usage_limit, once_per_customer = false
        } = args;

        const priceRuleData = {
          title, target_type, target_selection, allocation_method,
          value_type, value, customer_selection, starts_at, once_per_customer
        };
        if (ends_at) priceRuleData.ends_at = ends_at;
        if (usage_limit) priceRuleData.usage_limit = usage_limit;

        const data = await shopifyApiCall('/price_rules.json', {
          method: 'POST',
          body: JSON.stringify({ price_rule: priceRuleData })
        });

        return {
          content: [{
            type: 'text',
            text: `Price rule created!\n\nID: ${data.price_rule.id}\nTitle: ${data.price_rule.title}\nType: ${data.price_rule.value_type}\nValue: ${data.price_rule.value}\nStarts: ${data.price_rule.starts_at}\nEnds: ${data.price_rule.ends_at || 'No end date'}\n\nNow create a discount code with shopify_create_discount_code using price_rule_id: ${data.price_rule.id}`
          }]
        };
      }

      case 'shopify_create_discount_code': {
        const { price_rule_id, code } = args;

        const data = await shopifyApiCall(`/price_rules/${price_rule_id}/discount_codes.json`, {
          method: 'POST',
          body: JSON.stringify({ discount_code: { code } })
        });

        return {
          content: [{
            type: 'text',
            text: `Discount code created!\n\nID: ${data.discount_code.id}\nCode: ${data.discount_code.code}\nPrice Rule ID: ${data.discount_code.price_rule_id}\nUsage count: ${data.discount_code.usage_count}\nCreated: ${data.discount_code.created_at}`
          }]
        };
      }

      case 'shopify_delete_price_rule': {
        const { id } = args;
        await shopifyApiCall(`/price_rules/${id}.json`, { method: 'DELETE' });

        return {
          content: [{
            type: 'text',
            text: `Price rule ${id} and all associated discount codes deleted successfully.`
          }]
        };
      }

      // ──────────── INVENTORY ADJUSTMENT ────────────
      case 'shopify_adjust_inventory': {
        const { inventory_item_id, location_id, available_adjustment } = args;

        const data = await shopifyApiCall('/inventory_levels/adjust.json', {
          method: 'POST',
          body: JSON.stringify({ inventory_item_id, location_id, available_adjustment })
        });

        return {
          content: [{
            type: 'text',
            text: `Inventory adjusted!\n\nItem ID: ${data.inventory_level.inventory_item_id}\nLocation ID: ${data.inventory_level.location_id}\nNew available: ${data.inventory_level.available}\nUpdated at: ${data.inventory_level.updated_at}`
          }]
        };
      }

      case 'shopify_set_inventory': {
        const { inventory_item_id, location_id, available } = args;

        const data = await shopifyApiCall('/inventory_levels/set.json', {
          method: 'POST',
          body: JSON.stringify({ inventory_item_id, location_id, available })
        });

        return {
          content: [{
            type: 'text',
            text: `Inventory set!\n\nItem ID: ${data.inventory_level.inventory_item_id}\nLocation ID: ${data.inventory_level.location_id}\nAvailable: ${data.inventory_level.available}\nUpdated at: ${data.inventory_level.updated_at}`
          }]
        };
      }

      // ──────────── ORDER CANCEL / CLOSE ────────────
      case 'shopify_cancel_order': {
        const { id, reason = 'other', restock = true, email: sendEmail = true } = args;

        const data = await shopifyApiCall(`/orders/${id}/cancel.json`, {
          method: 'POST',
          body: JSON.stringify({ reason, restock, email: sendEmail })
        });

        return {
          content: [{
            type: 'text',
            text: `Order ${id} cancelled!\n\nOrder: ${data.order.name}\nReason: ${reason}\nRestock: ${restock}\nEmail sent: ${sendEmail}\nFinancial status: ${data.order.financial_status}`
          }]
        };
      }

      case 'shopify_close_order': {
        const { id } = args;

        const data = await shopifyApiCall(`/orders/${id}/close.json`, {
          method: 'POST'
        });

        return {
          content: [{
            type: 'text',
            text: `Order ${id} closed!\n\nOrder: ${data.order.name}\nClosed at: ${data.order.closed_at}`
          }]
        };
      }

      case 'shopify_reopen_order': {
        const { id } = args;

        const data = await shopifyApiCall(`/orders/${id}/open.json`, {
          method: 'POST'
        });

        return {
          content: [{
            type: 'text',
            text: `Order ${id} reopened!\n\nOrder: ${data.order.name}\nStatus: ${data.order.financial_status}`
          }]
        };
      }

      // ──────────── REFUNDS ────────────
      case 'shopify_calculate_refund': {
        const { order_id, refund_line_items, shipping } = args;

        const refundData = {};
        if (refund_line_items) refundData.refund_line_items = refund_line_items;
        if (shipping) refundData.shipping = shipping;

        const data = await shopifyApiCall(`/orders/${order_id}/refunds/calculate.json`, {
          method: 'POST',
          body: JSON.stringify({ refund: refundData })
        });

        const r = data.refund;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              refund_line_items: r.refund_line_items?.map(rli => ({
                line_item_id: rli.line_item_id,
                quantity: rli.quantity,
                subtotal: rli.subtotal,
                total_tax: rli.total_tax
              })),
              shipping: r.shipping,
              transactions: r.transactions?.map(t => ({
                amount: t.amount,
                kind: t.kind,
                gateway: t.gateway
              }))
            }, null, 2)
          }]
        };
      }

      case 'shopify_create_refund': {
        const { order_id, note, notify = true, refund_line_items: rli, shipping: sh } = args;

        const refundData = { notify };
        if (note) refundData.note = note;
        if (rli) refundData.refund_line_items = rli;
        if (sh) refundData.shipping = sh;

        const data = await shopifyApiCall(`/orders/${order_id}/refunds.json`, {
          method: 'POST',
          body: JSON.stringify({ refund: refundData })
        });

        const r = data.refund;
        return {
          content: [{
            type: 'text',
            text: `Refund created!\n\nID: ${r.id}\nOrder ID: ${r.order_id}\nNote: ${r.note || 'None'}\nItems refunded: ${r.refund_line_items?.length || 0}\nTransactions: ${r.transactions?.map(t => `${t.kind}: ${t.amount} ${t.currency}`).join(', ') || 'None'}\nCreated at: ${r.created_at}`
          }]
        };
      }

      // ──────────── INVENTORY (read) ────────────
      case 'shopify_get_inventory': {
        const { inventory_item_ids, location_ids } = args;

        let endpoint = '/inventory_levels.json?';
        if (inventory_item_ids) endpoint += `inventory_item_ids=${inventory_item_ids}&`;
        if (location_ids) endpoint += `location_ids=${location_ids}&`;

        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.inventory_levels, null, 2)
          }]
        };
      }

      case 'shopify_list_locations': {
        const data = await shopifyApiCall('/locations.json');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.locations.map(l => ({
              id: l.id,
              name: l.name,
              address1: l.address1,
              city: l.city,
              province: l.province,
              country: l.country_name,
              zip: l.zip,
              active: l.active,
              legacy: l.legacy
            })), null, 2)
          }]
        };
      }

      // ──────────── PAGES (CMS) ────────────
      case 'shopify_list_pages': {
        const { limit = 50, published_status = 'any' } = args;
        const data = await shopifyApiCall(`/pages.json?limit=${limit}&published_status=${published_status}`);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.pages.map(p => ({
              id: p.id,
              title: p.title,
              handle: p.handle,
              published_at: p.published_at,
              template_suffix: p.template_suffix,
              body_html_preview: p.body_html ? p.body_html.replace(/<[^>]*>/g, '').substring(0, 150) : null,
              created_at: p.created_at,
              updated_at: p.updated_at
            })), null, 2)
          }]
        };
      }

      case 'shopify_get_page': {
        const { id } = args;
        const data = await shopifyApiCall(`/pages/${id}.json`);
        const p = data.page;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: p.id,
              title: p.title,
              handle: p.handle,
              body_html: p.body_html,
              template_suffix: p.template_suffix,
              published_at: p.published_at,
              created_at: p.created_at,
              updated_at: p.updated_at
            }, null, 2)
          }]
        };
      }

      case 'shopify_create_page': {
        const { title, body_html, handle, published = false, template_suffix } = args;

        const pageData = { title };
        if (body_html) pageData.body_html = body_html;
        if (handle) pageData.handle = handle;
        pageData.published = published;
        if (template_suffix) pageData.template_suffix = template_suffix;

        const data = await shopifyApiCall('/pages.json', {
          method: 'POST',
          body: JSON.stringify({ page: pageData })
        });

        return {
          content: [{
            type: 'text',
            text: `Page created!\n\nID: ${data.page.id}\nTitle: ${data.page.title}\nHandle: ${data.page.handle}\nPublished: ${!!data.page.published_at}`
          }]
        };
      }

      case 'shopify_update_page': {
        const { id, ...updates } = args;

        const data = await shopifyApiCall(`/pages/${id}.json`, {
          method: 'PUT',
          body: JSON.stringify({ page: { id, ...updates } })
        });

        return {
          content: [{
            type: 'text',
            text: `Page ${id} updated!\n\nTitle: ${data.page.title}\nHandle: ${data.page.handle}\nUpdated at: ${data.page.updated_at}`
          }]
        };
      }

      case 'shopify_delete_page': {
        const { id } = args;
        await shopifyApiCall(`/pages/${id}.json`, { method: 'DELETE' });

        return {
          content: [{
            type: 'text',
            text: `Page ${id} deleted successfully.`
          }]
        };
      }

      // ──────────── BLOG / ARTICLES ────────────
      case 'shopify_list_blogs': {
        const data = await shopifyApiCall('/blogs.json');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.blogs.map(b => ({
              id: b.id,
              title: b.title,
              handle: b.handle,
              commentable: b.commentable,
              tags: b.tags,
              created_at: b.created_at,
              updated_at: b.updated_at
            })), null, 2)
          }]
        };
      }

      case 'shopify_list_articles': {
        const { blog_id, limit = 50, published_status = 'any', tag } = args;

        let endpoint = `/blogs/${blog_id}/articles.json?limit=${limit}&published_status=${published_status}`;
        if (tag) endpoint += `&tag=${encodeURIComponent(tag)}`;

        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.articles.map(a => ({
              id: a.id,
              title: a.title,
              handle: a.handle,
              author: a.author,
              tags: a.tags,
              published_at: a.published_at,
              summary_html: a.summary_html ? a.summary_html.replace(/<[^>]*>/g, '').substring(0, 150) : null,
              created_at: a.created_at,
              updated_at: a.updated_at
            })), null, 2)
          }]
        };
      }

      case 'shopify_get_article': {
        const { blog_id, article_id } = args;
        const data = await shopifyApiCall(`/blogs/${blog_id}/articles/${article_id}.json`);
        const a = data.article;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: a.id,
              title: a.title,
              handle: a.handle,
              author: a.author,
              body_html: a.body_html,
              summary_html: a.summary_html,
              tags: a.tags,
              image: a.image,
              published_at: a.published_at,
              created_at: a.created_at,
              updated_at: a.updated_at
            }, null, 2)
          }]
        };
      }

      case 'shopify_create_article': {
        const { blog_id, title, body_html, author, tags, summary_html, handle, published = false, image } = args;

        const articleData = { title, body_html };
        if (author) articleData.author = author;
        if (tags) articleData.tags = tags;
        if (summary_html) articleData.summary_html = summary_html;
        if (handle) articleData.handle = handle;
        articleData.published = published;
        if (image) articleData.image = image;

        const data = await shopifyApiCall(`/blogs/${blog_id}/articles.json`, {
          method: 'POST',
          body: JSON.stringify({ article: articleData })
        });

        return {
          content: [{
            type: 'text',
            text: `Article created!\n\nID: ${data.article.id}\nTitle: ${data.article.title}\nHandle: ${data.article.handle}\nAuthor: ${data.article.author}\nPublished: ${!!data.article.published_at}`
          }]
        };
      }

      case 'shopify_update_article': {
        const { blog_id, article_id, ...updates } = args;

        const data = await shopifyApiCall(`/blogs/${blog_id}/articles/${article_id}.json`, {
          method: 'PUT',
          body: JSON.stringify({ article: { id: article_id, ...updates } })
        });

        return {
          content: [{
            type: 'text',
            text: `Article ${article_id} updated!\n\nTitle: ${data.article.title}\nHandle: ${data.article.handle}\nUpdated at: ${data.article.updated_at}`
          }]
        };
      }

      // ──────────── COLLECTIONS CRUD ────────────
      case 'shopify_create_collection': {
        const { title, body_html, handle, published = true, image, sort_order } = args;

        const collData = { title };
        if (body_html) collData.body_html = body_html;
        if (handle) collData.handle = handle;
        collData.published = published;
        if (image) collData.image = image;
        if (sort_order) collData.sort_order = sort_order;

        const data = await shopifyApiCall('/custom_collections.json', {
          method: 'POST',
          body: JSON.stringify({ custom_collection: collData })
        });

        return {
          content: [{
            type: 'text',
            text: `Collection created!\n\nID: ${data.custom_collection.id}\nTitle: ${data.custom_collection.title}\nHandle: ${data.custom_collection.handle}\nPublished: ${!!data.custom_collection.published_at}`
          }]
        };
      }

      case 'shopify_update_collection': {
        const { id, ...updates } = args;

        const data = await shopifyApiCall(`/custom_collections/${id}.json`, {
          method: 'PUT',
          body: JSON.stringify({ custom_collection: { id, ...updates } })
        });

        return {
          content: [{
            type: 'text',
            text: `Collection ${id} updated!\n\nTitle: ${data.custom_collection.title}\nHandle: ${data.custom_collection.handle}\nUpdated at: ${data.custom_collection.updated_at}`
          }]
        };
      }

      case 'shopify_delete_collection': {
        const { id } = args;
        await shopifyApiCall(`/custom_collections/${id}.json`, { method: 'DELETE' });

        return {
          content: [{
            type: 'text',
            text: `Collection ${id} deleted successfully.`
          }]
        };
      }

      case 'shopify_add_product_to_collection': {
        const { collection_id, product_id } = args;

        const data = await shopifyApiCall('/collects.json', {
          method: 'POST',
          body: JSON.stringify({ collect: { collection_id, product_id } })
        });

        return {
          content: [{
            type: 'text',
            text: `Product ${product_id} added to collection ${collection_id}!\n\nCollect ID: ${data.collect.id}`
          }]
        };
      }

      case 'shopify_remove_product_from_collection': {
        const { collection_id, product_id } = args;

        // Find the collect linking this product to this collection
        const collectsData = await shopifyApiCall(`/collects.json?collection_id=${collection_id}&product_id=${product_id}`);

        if (collectsData.collects.length === 0) {
          return {
            content: [{ type: 'text', text: `Product ${product_id} is not in collection ${collection_id}.` }]
          };
        }

        const collectId = collectsData.collects[0].id;
        await shopifyApiCall(`/collects/${collectId}.json`, { method: 'DELETE' });

        return {
          content: [{
            type: 'text',
            text: `Product ${product_id} removed from collection ${collection_id}.`
          }]
        };
      }

      // ──────────── URL REDIRECTS ────────────
      case 'shopify_list_redirects': {
        const { limit = 50, path, target } = args;

        let endpoint = `/redirects.json?limit=${limit}`;
        if (path) endpoint += `&path=${encodeURIComponent(path)}`;
        if (target) endpoint += `&target=${encodeURIComponent(target)}`;

        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.redirects.map(r => ({
              id: r.id,
              path: r.path,
              target: r.target
            })), null, 2)
          }]
        };
      }

      case 'shopify_create_redirect': {
        const { path, target } = args;

        const data = await shopifyApiCall('/redirects.json', {
          method: 'POST',
          body: JSON.stringify({ redirect: { path, target } })
        });

        return {
          content: [{
            type: 'text',
            text: `Redirect created!\n\nID: ${data.redirect.id}\nFrom: ${data.redirect.path}\nTo: ${data.redirect.target}`
          }]
        };
      }

      case 'shopify_delete_redirect': {
        const { id } = args;
        await shopifyApiCall(`/redirects/${id}.json`, { method: 'DELETE' });

        return {
          content: [{
            type: 'text',
            text: `Redirect ${id} deleted successfully.`
          }]
        };
      }

      // ──────────── WEBHOOKS ────────────
      case 'shopify_list_webhooks': {
        const { limit = 50, topic } = args;

        let endpoint = `/webhooks.json?limit=${limit}`;
        if (topic) endpoint += `&topic=${encodeURIComponent(topic)}`;

        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.webhooks.map(w => ({
              id: w.id,
              topic: w.topic,
              address: w.address,
              format: w.format,
              created_at: w.created_at,
              updated_at: w.updated_at
            })), null, 2)
          }]
        };
      }

      case 'shopify_create_webhook': {
        const { topic, address, format = 'json' } = args;

        const data = await shopifyApiCall('/webhooks.json', {
          method: 'POST',
          body: JSON.stringify({ webhook: { topic, address, format } })
        });

        return {
          content: [{
            type: 'text',
            text: `Webhook created!\n\nID: ${data.webhook.id}\nTopic: ${data.webhook.topic}\nAddress: ${data.webhook.address}\nFormat: ${data.webhook.format}`
          }]
        };
      }

      case 'shopify_delete_webhook': {
        const { id } = args;
        await shopifyApiCall(`/webhooks/${id}.json`, { method: 'DELETE' });

        return {
          content: [{
            type: 'text',
            text: `Webhook ${id} deleted successfully.`
          }]
        };
      }

      // ──────────── ABANDONED CHECKOUTS ────────────
      case 'shopify_list_abandoned_checkouts': {
        const { limit = 50, status = 'open', created_at_min, created_at_max } = args;

        let endpoint = `/checkouts.json?limit=${limit}&status=${status}`;
        if (created_at_min) endpoint += `&created_at_min=${encodeURIComponent(created_at_min)}`;
        if (created_at_max) endpoint += `&created_at_max=${encodeURIComponent(created_at_max)}`;

        const data = await shopifyApiCall(endpoint);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.checkouts.map(c => ({
              id: c.id,
              token: c.token,
              email: c.email,
              total_price: c.total_price,
              currency: c.currency,
              line_items_count: c.line_items?.length || 0,
              customer: c.customer ? `${c.customer.first_name || ''} ${c.customer.last_name || ''}`.trim() : 'Anonymous',
              abandoned_checkout_url: c.abandoned_checkout_url,
              created_at: c.created_at,
              completed_at: c.completed_at
            })), null, 2)
          }]
        };
      }

      // ──────────── TRANSACTIONS ────────────
      case 'shopify_list_transactions': {
        const { order_id } = args;
        const data = await shopifyApiCall(`/orders/${order_id}/transactions.json`);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.transactions.map(t => ({
              id: t.id,
              kind: t.kind,
              status: t.status,
              amount: t.amount,
              currency: t.currency,
              gateway: t.gateway,
              authorization: t.authorization,
              parent_id: t.parent_id,
              error_code: t.error_code,
              message: t.message,
              created_at: t.created_at
            })), null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Shopify MCP Server started successfully');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
