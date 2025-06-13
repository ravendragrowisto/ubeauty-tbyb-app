# Try Before You Buy (TBYB) Shopify App

A comprehensive Shopify app that enables merchants to offer "Try Before You Buy" functionality using Shopify's selling plans and deferred purchase options. Customers can order samples with a deposit, try them for a specified period, and then decide whether to keep the full-size product.

## Features

### Core Functionality
- **Sample Orders**: Customers pay a deposit to receive product samples
- **14-Day Trial Period**: Configurable trial duration (default 14 days)
- **Deferred Payments**: Automatic charging of remaining balance if customer keeps product
- **Easy Cancellation**: Customers can cancel anytime during trial period
- **Admin Dashboard**: Comprehensive management interface for merchants

### Selling Plans Integration
- Uses Shopify's native selling plans for deferred purchase options
- Automatic creation of TBYB selling plan groups
- Seamless integration with Shopify checkout
- Support for multiple products and variants

### Customer Experience
- **Storefront Integration**: Theme extension with TBYB button on product pages
- **Modal Interface**: Informative modal explaining the TBYB process
- **Trial Management**: Customer account page for managing active trials
- **Email & SMS Reminders**: Integration with Klaviyo and Postscript

### Merchant Tools
- **Product Configuration**: Easy setup of TBYB for specific products
- **Trial Tracking**: Real-time dashboard showing trial statuses
- **Customer Management**: View customer trial history and actions
- **Analytics**: Conversion rates and trial performance metrics

## Quick Start

### Prerequisites

1. [Node.js](https://nodejs.org/en/download/) (v18.20+ or v20.10+ or v21.0.0+)
2. [Shopify Partner Account](https://partners.shopify.com/signup)
3. Development store or Shopify Plus sandbox
4. Shopify CLI installed globally

### Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd ubeauty-tbyb-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up the database:
```bash
npx prisma migrate dev --name init
```

4. Start development server:
```bash
npm run dev
```

5. Follow the CLI prompts to connect to your Shopify store

### Configuration

1. **App Permissions**: The app requires these scopes:
   - `write_products`, `read_products`
   - `write_orders`, `read_orders`
   - `write_customers`, `read_customers`
   - `write_purchase_options`, `read_purchase_options`
   - `write_payment_terms`, `read_payment_terms`

2. **Webhooks**: Automatically configured for:
   - Order creation and payment
   - Payment terms updates
   - Subscription contract events

## Usage

### Setting Up TBYB for Products

1. Navigate to the TBYB admin dashboard
2. Click "Configure Product"
3. Select a product from the dropdown
4. Set trial period (default: 14 days)
5. Set deposit amount (default: $10.00)
6. Set maximum samples per customer
7. Click "Create Configuration"

### Theme Integration

1. Install the theme extension from the app dashboard
2. Add the TBYB block to product pages in theme customizer
3. Configure button text, colors, and messaging
4. Test the functionality on a development store

### Customer Flow

1. Customer visits product page with TBYB enabled
2. Clicks "Try Before You Buy" button
3. Reviews trial terms in modal
4. Adds sample to cart with selling plan
5. Completes checkout with deposit payment
6. Receives sample and trial confirmation
7. Gets reminder emails/SMS during trial
8. Confirms purchase or cancels before trial ends

## Architecture

### Database Schema

- **TBYBConfig**: Product-specific TBYB settings
- **CustomerSampleHistory**: Trial tracking and status
- **TBYBPaymentTerm**: Payment term management

### Key Components

- **Admin Interface**: React/Remix app for merchant management
- **Theme Extension**: Liquid templates for storefront integration
- **Webhook Handlers**: Process order and payment events
- **API Endpoints**: Handle eligibility checks and cart operations

### Selling Plans Implementation

The app creates selling plans with:
- **Category**: `TRY_BEFORE_YOU_BUY`
- **Billing Policy**: Deferred payment after trial period
- **Pricing Policy**: Fixed deposit amount upfront
- **Delivery Policy**: Immediate sample shipping

## Integrations

### Email Marketing (Klaviyo)

Set up automated email flows for:
- Trial start confirmation
- Mid-trial check-ins
- Trial ending reminders
- Order confirmations

See [Klaviyo Flow Setup](./docs/klaviyo-flow-setup.md) for detailed configuration.

### SMS Marketing (Postscript)

Configure SMS campaigns for:
- Trial welcome messages
- Reminder notifications
- Final trial alerts
- Order confirmations

See [Postscript Flow Setup](./docs/postscript-flow-setup.md) for setup instructions.

### Shopify Flow

Automate workflows for:
- Trial status updates
- Customer notifications
- Inventory management
- Analytics tracking

## Development

### Project Structure

```
├── app/
│   ├── routes/                 # Remix routes
│   │   ├── app._index.jsx     # Main admin dashboard
│   │   ├── app.customer-account.jsx  # Customer management
│   │   └── webhooks/          # Webhook handlers
│   ├── db.server.js           # Database connection
│   └── shopify.server.js      # Shopify API setup
├── extensions/
│   └── tbyb/                  # Theme extension
│       ├── blocks/            # Liquid blocks
│       ├── assets/            # CSS/JS assets
│       └── shopify.extension.toml
├── prisma/
│   └── schema.prisma          # Database schema
└── docs/                      # Documentation
```

### API Endpoints

- `POST /app/api/tbyb/check-eligibility` - Check if customer can use TBYB
- `POST /app/api/tbyb/check-cart` - Validate cart compatibility
- `GET /app/customer-account` - Customer trial management page

### Database Migrations

Run migrations when schema changes:
```bash
npx prisma migrate dev --name migration_name
```

Generate Prisma client after schema updates:
```bash
npx prisma generate
```

## Deployment

### Environment Variables

Set these in production:
```
DATABASE_URL=your_production_database_url
SHOPIFY_API_KEY=your_app_api_key
SHOPIFY_API_SECRET=your_app_secret
SCOPES=write_products,read_products,write_orders,read_orders,write_customers,read_customers,write_purchase_options,read_purchase_options,write_payment_terms,read_payment_terms
KLAVIYO_API_KEY=your_klaviyo_key (optional)
POSTSCRIPT_API_KEY=your_postscript_key (optional)
```

### Database

For production, consider upgrading from SQLite to:
- PostgreSQL (recommended)
- MySQL
- PlanetScale
- Supabase

Update `prisma/schema.prisma` datasource accordingly.

### Hosting Options

Deploy to:
- [Shopify Oxygen](https://shopify.dev/docs/custom-storefronts/oxygen)
- [Vercel](https://vercel.com/)
- [Railway](https://railway.app/)
- [Fly.io](https://fly.io/)
- [Heroku](https://heroku.com/)

## Testing

### Manual Testing

1. Create test products in development store
2. Configure TBYB for test products
3. Place sample orders as test customer
4. Verify trial tracking and status updates
5. Test confirmation and cancellation flows

### Automated Testing

```bash
# Run tests (when implemented)
npm test

# Run linting
npm run lint

# Type checking
npm run typecheck
```

## Troubleshooting

### Common Issues

1. **Selling plan not appearing**: Check product configuration and app permissions
2. **Webhooks not firing**: Verify webhook URLs and authentication
3. **Theme extension not showing**: Ensure extension is installed and block is added
4. **Database errors**: Check connection string and run migrations

### Debug Mode

Enable debug logging:
```bash
DEBUG=tbyb:* npm run dev
```

### Support

- Check the [Issues](./issues) for known problems
- Review [Shopify App Development docs](https://shopify.dev/docs/apps)
- Contact technical support for app-specific issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

---

**Version**: 1.0.0  
**Last Updated**: June 2, 2025  
**Shopify API Version**: 2025-04 