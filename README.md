# Shopify MCP Server

A comprehensive [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for the Shopify Admin API. Manage your entire Shopify store through any MCP-compatible AI client (Claude Code, Claude Desktop, Cursor, etc.).

## Features

**46 tools** covering the full Shopify Admin API:

| Category | Tools | Description |
|----------|-------|-------------|
| **Shop** | 1 | Store information |
| **Products** | 5 | Full CRUD + delete |
| **Orders** | 6 | List, get, update, cancel, close, reopen |
| **Customers** | 5 | CRUD + search |
| **Draft Orders** | 3 | Create, list, complete |
| **Collections** | 6 | CRUD + add/remove products |
| **Metafields** | 3 | Get, set, delete on any resource |
| **Fulfillments** | 2 | Create with tracking, list |
| **Discounts** | 4 | Price rules + discount codes |
| **Inventory** | 4 | Get, adjust, set levels + locations |
| **Refunds** | 2 | Calculate + create |
| **Pages (CMS)** | 5 | Full CRUD for CMS pages |
| **Blog/Articles** | 5 | List blogs, CRUD articles |
| **URL Redirects** | 3 | List, create, delete 301s |
| **Webhooks** | 3 | List, create, delete |
| **Abandoned Checkouts** | 1 | List abandoned carts |
| **Transactions** | 1 | Payment transactions per order |

### Built-in Optimizations

- **Automatic rate limiting** - Detects Shopify 429 responses and retries with `Retry-After` header (max 2 retries)
- **Safe DELETE handling** - Properly handles empty response bodies from DELETE endpoints
- **Cursor-based pagination** - Supports Shopify's `page_info` cursor for efficient large dataset navigation
- **Structured responses** - Clean, formatted output with only relevant fields (no raw API noise)
- **Error isolation** - All errors are caught and returned with `isError: true` flag for proper MCP error handling

## Prerequisites

- **Node.js 18+**
- A **Shopify store** (development or production)
- A **Custom App** with Admin API access token (`shpat_xxx`)

## Quick Start

### 1. Create a Shopify Custom App

1. Go to your Shopify Admin > **Settings** > **Apps and sales channels** > **Develop apps**
2. Click **Create an app** and name it (e.g., `mcp-connector`)
3. Configure **Admin API scopes**:
   ```
   read_products, write_products
   read_orders, write_orders
   read_customers, write_customers
   read_inventory, write_inventory
   read_draft_orders, write_draft_orders
   read_locations
   read_content, write_content
   read_themes
   read_shipping, write_shipping
   read_price_rules, write_price_rules
   read_discounts, write_discounts
   read_checkouts
   read_publications
   ```
4. **Install** the app on your store
5. Copy the **Admin API access token** (starts with `shpat_`)

### 2. Install

```bash
git clone https://github.com/GeorgesAdSim/shopify-mcp-server.git
cd shopify-mcp-server
npm install
```

### 3. Configure your MCP Client

#### Claude Code (CLI)

```bash
claude mcp add shopify -- node /path/to/shopify-mcp-server/index.js \
  -e SHOPIFY_ACCESS_TOKEN=shpat_your_token \
  -e SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
```

Or add manually to `~/.claude.json` (global) or `.claude/settings.local.json` (project):

```json
{
  "mcpServers": {
    "shopify": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/shopify-mcp-server/index.js"],
      "env": {
        "SHOPIFY_ACCESS_TOKEN": "shpat_your_token_here",
        "SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com"
      }
    }
  }
}
```

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "shopify": {
      "command": "node",
      "args": ["/path/to/shopify-mcp-server/index.js"],
      "env": {
        "SHOPIFY_ACCESS_TOKEN": "shpat_your_token_here",
        "SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com"
      }
    }
  }
}
```

#### Cursor / Other MCP Clients

Use the same JSON configuration adapted to your client's MCP settings format.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_ACCESS_TOKEN` | Yes | Admin API access token (`shpat_xxx`) |
| `SHOPIFY_STORE_DOMAIN` | Yes | Your store domain (`xxx.myshopify.com`) |
| `SHOPIFY_API_VERSION` | No | API version (default: `2024-10`) |

## Usage Examples

Once configured, you can ask your AI assistant things like:

**Products**
- *"List all my products"*
- *"Create a product called 'T-shirt Premium' at 29.99 EUR with 100 in stock"*
- *"Update the price of product #123 to 39.99"*
- *"Delete product #456"*

**Orders**
- *"Show me orders from the last 7 days"*
- *"Get details of order #1042"*
- *"Cancel order #1038 and restock items"*
- *"Mark order #1042 as shipped with tracking number XX123456 via DHL"*

**Customers**
- *"Search for customer john@example.com"*
- *"Create a customer Jean Dupont with email jean@example.com"*
- *"Show me all customers who ordered in the last month"*

**Discounts**
- *"Create a 20% discount code SUMMER20 valid until end of month"*
- *"List all active discount codes"*

**Content**
- *"Create a blog article about our new collection"*
- *"Update the About page with new content"*
- *"Add a redirect from /old-page to /new-page"*

**Inventory**
- *"What's the stock level for product #123?"*
- *"Add 50 units to product variant #789"*
- *"List all warehouse locations"*

**Refunds**
- *"Calculate a refund for 2 items from order #1038"*
- *"Process the refund and notify the customer"*

**Other**
- *"List abandoned checkouts from this week"*
- *"Create a webhook for new orders"*
- *"Show payment transactions for order #1042"*

## Tool Reference

### Shop
| Tool | Description |
|------|-------------|
| `shopify_get_shop` | Get store info (name, domain, currency, timezone, plan) |

### Products
| Tool | Description |
|------|-------------|
| `shopify_list_products` | List/filter products (by status, vendor, type, collection) with cursor pagination |
| `shopify_get_product` | Get full product details (variants, images, options, inventory) |
| `shopify_create_product` | Create product with variants, images, tags |
| `shopify_update_product` | Update any product field |
| `shopify_delete_product` | Delete a product (irreversible) |

### Orders
| Tool | Description |
|------|-------------|
| `shopify_list_orders` | Filter by status, financial/fulfillment status, date range |
| `shopify_get_order` | Full details: line items, addresses, customer, totals |
| `shopify_update_order` | Update notes, tags, email, shipping address |
| `shopify_cancel_order` | Cancel with reason, restock option, email notification |
| `shopify_close_order` | Archive/close a completed order |
| `shopify_reopen_order` | Reopen a closed order |

### Customers
| Tool | Description |
|------|-------------|
| `shopify_list_customers` | List with date filters |
| `shopify_get_customer` | Full profile with addresses and order history |
| `shopify_create_customer` | Create with addresses, tags, notes |
| `shopify_update_customer` | Update name, email, phone, tags, notes |
| `shopify_search_customers` | Search by name, email, phone |

### Draft Orders
| Tool | Description |
|------|-------------|
| `shopify_list_draft_orders` | List by status (open, invoice_sent, completed) |
| `shopify_create_draft_order` | Create with line items, customer, shipping |
| `shopify_complete_draft_order` | Finalize into a real order |

### Fulfillments
| Tool | Description |
|------|-------------|
| `shopify_create_fulfillment` | Ship with tracking (DHL, UPS, FedEx, Bpost, La Poste, PostNL...) |
| `shopify_list_fulfillments` | List fulfillments for an order |

### Discounts
| Tool | Description |
|------|-------------|
| `shopify_list_price_rules` | List all discount rules |
| `shopify_create_price_rule` | Create % or fixed amount discount |
| `shopify_create_discount_code` | Create a code (e.g., SUMMER20, BIENVENUE10) |
| `shopify_delete_price_rule` | Delete rule + associated codes |

### Inventory
| Tool | Description |
|------|-------------|
| `shopify_get_inventory` | Get stock levels by item or location |
| `shopify_adjust_inventory` | Add/remove stock (+10, -5) |
| `shopify_set_inventory` | Set absolute stock level |
| `shopify_list_locations` | List all warehouses/stores |

### Refunds
| Tool | Description |
|------|-------------|
| `shopify_calculate_refund` | Preview refund amounts before creating |
| `shopify_create_refund` | Create refund with restock + customer notification |

### Metafields
| Tool | Description |
|------|-------------|
| `shopify_get_metafields` | Read custom fields on any resource (product, order, customer, shop) |
| `shopify_set_metafield` | Create/update custom fields (text, number, boolean, JSON, URL, date...) |
| `shopify_delete_metafield` | Delete a custom field |

### Pages (CMS)
| Tool | Description |
|------|-------------|
| `shopify_list_pages` | List all pages (About, FAQ, Contact...) |
| `shopify_get_page` | Get page content |
| `shopify_create_page` | Create a new CMS page |
| `shopify_update_page` | Update page content/title/handle |
| `shopify_delete_page` | Delete a page |

### Blog / Articles
| Tool | Description |
|------|-------------|
| `shopify_list_blogs` | List all blogs |
| `shopify_list_articles` | List articles in a blog (filter by tag, status) |
| `shopify_get_article` | Get full article content |
| `shopify_create_article` | Create article with author, tags, featured image |
| `shopify_update_article` | Update an article |

### Collections
| Tool | Description |
|------|-------------|
| `shopify_list_collections` | List custom + smart collections |
| `shopify_create_collection` | Create a custom collection |
| `shopify_update_collection` | Update title, description, sort order |
| `shopify_delete_collection` | Delete a collection |
| `shopify_add_product_to_collection` | Add product to collection |
| `shopify_remove_product_from_collection` | Remove product from collection |

### URL Redirects
| Tool | Description |
|------|-------------|
| `shopify_list_redirects` | List 301 redirects |
| `shopify_create_redirect` | Create a 301 redirect |
| `shopify_delete_redirect` | Delete a redirect |

### Webhooks
| Tool | Description |
|------|-------------|
| `shopify_list_webhooks` | List registered webhooks |
| `shopify_create_webhook` | Register a new webhook (orders, products, customers...) |
| `shopify_delete_webhook` | Delete a webhook |

### Other
| Tool | Description |
|------|-------------|
| `shopify_list_abandoned_checkouts` | List abandoned carts with customer info |
| `shopify_list_transactions` | Payment transactions for an order |

## Architecture

```
shopify-mcp-server/
  index.js          # Single-file MCP server (46 tools)
  package.json      # Dependencies (@modelcontextprotocol/sdk, node-fetch)
  README.md
  LICENSE
  .gitignore
```

**Design principles:**
- **Single file** - Everything in `index.js` for easy deployment and debugging
- **Zero config** - Just set 2 environment variables and go
- **MCP SDK** - Built on `@modelcontextprotocol/sdk` v1.8.0 with stdio transport
- **REST API** - Uses Shopify Admin REST API (not GraphQL) for maximum compatibility

## Security

- **Never commit your access token** - use environment variables
- The `.env` file is in `.gitignore`
- Use a **development store** for testing
- Only grant the minimum required API scopes
- Access tokens start with `shpat_` and are permanent (rotate them if compromised)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Shopify API Error (401)` | Invalid access token. Check `SHOPIFY_ACCESS_TOKEN` |
| `Shopify API Error (404)` | Wrong store domain or API version. Check `SHOPIFY_STORE_DOMAIN` |
| `Shopify API Error (403)` | Missing API scope. Add the required scope in your custom app settings |
| `Shopify API Error (429)` | Rate limited. The server auto-retries with `Retry-After` (max 2 retries) |
| MCP not connecting | Ensure `node` is in your PATH and the `index.js` path is absolute |

## License

MIT - See [LICENSE](LICENSE)

## Author

**Georges Cordewiener** - [AdSim](https://adsim.be)
