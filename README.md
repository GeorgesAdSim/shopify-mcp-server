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

## Prerequisites

- **Node.js 18+**
- A **Shopify store** (development or production)
- A **Custom App** with Admin API access token (`shpat_xxx`)

## Setup

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
   ```
4. **Install** the app on your store
5. Copy the **Admin API access token** (starts with `shpat_`)

### 2. Install the MCP Server

```bash
git clone https://github.com/GeorgesAdSim/shopify-mcp-server.git
cd shopify-mcp-server
npm install
```

### 3. Configure your MCP Client

#### Claude Code

```bash
claude mcp add shopify -- node /path/to/shopify-mcp-server/index.js \
  -e SHOPIFY_ACCESS_TOKEN=shpat_your_token \
  -e SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
```

Or add manually to your Claude config:

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

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_ACCESS_TOKEN` | Yes | Admin API access token (`shpat_xxx`) |
| `SHOPIFY_STORE_DOMAIN` | Yes | Your store domain (`xxx.myshopify.com`) |
| `SHOPIFY_API_VERSION` | No | API version (default: `2024-10`) |

## Usage Examples

Once configured, you can ask your AI assistant things like:

- *"List all my products"*
- *"Create a product called 'T-shirt Premium' at 29.99 EUR with 100 in stock"*
- *"Show me orders from the last 7 days"*
- *"Create a 20% discount code SUMMER20 valid until end of month"*
- *"Mark order #1042 as shipped with tracking number XX123456"*
- *"Search for customer john@example.com"*
- *"Create a blog article about our new collection"*
- *"List abandoned checkouts from this week"*
- *"Refund 2 items from order #1038"*
- *"Add a redirect from /old-page to /new-page"*

## Tool Reference

### Products
- `shopify_list_products` - List/filter products (by status, vendor, type, collection)
- `shopify_get_product` - Get product details (variants, images, options)
- `shopify_create_product` - Create with variants, images, tags
- `shopify_update_product` - Update any product field
- `shopify_delete_product` - Delete a product

### Orders
- `shopify_list_orders` - Filter by status, financial/fulfillment status, date range
- `shopify_get_order` - Full details: line items, addresses, customer
- `shopify_update_order` - Update notes, tags, email, shipping address
- `shopify_cancel_order` - Cancel with reason, restock option, customer notification
- `shopify_close_order` - Archive/close a completed order
- `shopify_reopen_order` - Reopen a closed order

### Customers
- `shopify_list_customers` - List with date filters
- `shopify_get_customer` - Full profile with addresses
- `shopify_create_customer` - Create with addresses
- `shopify_update_customer` - Update name, email, tags, notes
- `shopify_search_customers` - Search by name, email, phone

### Fulfillments
- `shopify_create_fulfillment` - Ship with tracking (DHL, UPS, FedEx, Bpost, La Poste...)
- `shopify_list_fulfillments` - List fulfillments for an order

### Discounts
- `shopify_list_price_rules` - List all discount rules
- `shopify_create_price_rule` - Create % or fixed amount discount
- `shopify_create_discount_code` - Create a code (e.g., SUMMER20)
- `shopify_delete_price_rule` - Delete rule + associated codes

### Inventory
- `shopify_get_inventory` - Get stock levels
- `shopify_adjust_inventory` - Add/remove stock (+10, -5)
- `shopify_set_inventory` - Set absolute stock level
- `shopify_list_locations` - List warehouses/stores

### Refunds
- `shopify_calculate_refund` - Preview refund before creating
- `shopify_create_refund` - Create refund with restock + notification

### Metafields
- `shopify_get_metafields` - Read custom fields on any resource
- `shopify_set_metafield` - Create/update custom fields
- `shopify_delete_metafield` - Delete a custom field

### Pages (CMS)
- `shopify_list_pages` - List all pages
- `shopify_get_page` - Get page content
- `shopify_create_page` - Create a page (About, FAQ, etc.)
- `shopify_update_page` - Update page content
- `shopify_delete_page` - Delete a page

### Blog / Articles
- `shopify_list_blogs` - List all blogs
- `shopify_list_articles` - List articles in a blog
- `shopify_get_article` - Get article content
- `shopify_create_article` - Create a blog article
- `shopify_update_article` - Update an article

### Collections
- `shopify_list_collections` - List custom + smart collections
- `shopify_create_collection` - Create a custom collection
- `shopify_update_collection` - Update a collection
- `shopify_delete_collection` - Delete a collection
- `shopify_add_product_to_collection` - Add product to collection
- `shopify_remove_product_from_collection` - Remove product from collection

### Other
- `shopify_list_redirects` / `create` / `delete` - URL redirects (301)
- `shopify_list_webhooks` / `create` / `delete` - Webhook management
- `shopify_list_abandoned_checkouts` - Abandoned carts
- `shopify_list_transactions` - Payment transactions
- `shopify_list_draft_orders` / `create` / `complete` - Draft orders

## Security

- **Never commit your access token** - use environment variables
- The `.env` file is in `.gitignore`
- Use a **development store** for testing
- Only grant the minimum required API scopes

## License

MIT - See [LICENSE](LICENSE)

## Author

**Georges Cordewiener** - [AdSim](https://adsim.be)
