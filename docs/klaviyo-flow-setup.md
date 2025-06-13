# Klaviyo Flow Setup for TBYB

This document outlines how to set up Klaviyo email flows for Try Before You Buy (TBYB) trial reminders and confirmations.

## Prerequisites

- Active Klaviyo account
- Klaviyo API key (Private Key)
- TBYB app installed and configured
- Access to Shopify Flow (Shopify Plus required)

## Overview

The TBYB Klaviyo integration uses Shopify Flow to trigger email campaigns based on order metafield updates. When a customer orders a sample, the app sets metafields on the order that trigger Klaviyo flows for trial reminders.

## Setup Steps

### 1. Get Klaviyo API Key

1. Log into your Klaviyo account
2. Go to Account > Settings > API Keys
3. Copy your Private API Key
4. Add it to your app's environment variables as `KLAVIYO_API_KEY`

### 2. Create Shopify Flow (Shopify Plus)

1. In Shopify admin, go to Settings > Apps and sales channels > Flow
2. Click "Create workflow"
3. Set up the following trigger and actions:

#### Trigger: Order Metafield Updated
- **Object**: Order
- **Metafield Namespace**: `tbyb`
- **Metafield Key**: `trial_start`

#### Condition: Check Trial Status
- **Field**: Order metafield `tbyb.status`
- **Condition**: equals `TRIAL_ACTIVE`

#### Action: HTTP Request to Klaviyo
- **Method**: POST
- **URL**: `https://a.klaviyo.com/api/track`
- **Headers**:
  ```
  Authorization: Klaviyo-API-Key YOUR_KLAVIYO_API_KEY
  Content-Type: application/json
  ```
- **Body**:
  ```json
  {
    "data": {
      "type": "event",
      "attributes": {
        "metric": {
          "name": "TBYB Trial Started"
        },
        "profile": {
          "email": "{{ order.customer.email }}",
          "first_name": "{{ order.customer.firstName }}",
          "last_name": "{{ order.customer.lastName }}"
        },
        "properties": {
          "order_id": "{{ order.id }}",
          "trial_start_date": "{{ order.metafield.tbyb.trial_start }}",
          "trial_end_date": "{{ order.metafield.tbyb.trial_end }}",
          "deposit_amount": "{{ order.metafield.tbyb.deposit_amount }}",
          "product_title": "{{ order.lineItems.first.title }}"
        }
      }
    }
  }
  ```

### 3. Create Klaviyo Email Flows

#### Flow 1: Trial Reminder Sequence

1. **Trigger**: Custom event "TBYB Trial Started"
2. **Email 1** (Day 7): Mid-trial check-in
   - Subject: "How's your {{ event.product_title }} sample going?"
   - Content: Remind customer about trial, provide care instructions
3. **Email 2** (Day 12): Trial ending soon
   - Subject: "Your trial ends in 2 days - {{ event.product_title }}"
   - Content: Urgent reminder with clear CTA to confirm or cancel
4. **Email 3** (Day 14): Final reminder
   - Subject: "Last chance - Your {{ event.product_title }} trial expires today"
   - Content: Final call to action

#### Flow 2: Trial Expired Follow-up

1. **Trigger**: Custom event "TBYB Trial Expired"
2. **Email**: One-time follow-up
   - Subject: "Your trial has expired - What's next?"
   - Content: Offer to restart trial or provide customer service contact

#### Flow 3: Order Confirmed Thank You

1. **Trigger**: Custom event "TBYB Order Confirmed"
2. **Email**: Confirmation and shipping info
   - Subject: "Thanks for confirming your {{ event.product_title }} order!"
   - Content: Order confirmation, shipping timeline, care instructions

### 4. Template Variables

Use these Klaviyo template variables in your emails:

- `{{ event.order_id }}` - Shopify order ID
- `{{ event.trial_start_date }}` - Trial start date
- `{{ event.trial_end_date }}` - Trial end date
- `{{ event.deposit_amount }}` - Deposit amount paid
- `{{ event.product_title }}` - Product name
- `{{ person.first_name }}` - Customer first name
- `{{ person.email }}` - Customer email

### 5. Testing

1. Create a test TBYB configuration for a product
2. Place a sample order in your development store
3. Verify that the Shopify Flow triggers
4. Check Klaviyo for the custom event
5. Confirm emails are sent according to the flow schedule

## Advanced Configuration

### Custom Events

You can create additional custom events for more sophisticated flows:

- `TBYB Sample Shipped` - When sample is marked as shipped
- `TBYB Order Cancelled` - When customer cancels trial
- `TBYB Payment Failed` - When final payment fails

### Segmentation

Create Klaviyo segments for TBYB customers:

- **Active Trial Customers**: Have active TBYB trials
- **TBYB Converters**: Confirmed their trial orders
- **TBYB Cancellers**: Cancelled their trials
- **High-Value TBYB**: Multiple TBYB orders or high-value confirmations

### Personalization

Use Klaviyo's advanced personalization:

- Product recommendations based on trial history
- Dynamic content based on trial status
- Personalized timing based on customer behavior

## Troubleshooting

### Common Issues

1. **Flow not triggering**
   - Check metafield namespace and key match exactly
   - Verify Shopify Flow is active
   - Ensure order metafields are being set correctly

2. **Klaviyo events not appearing**
   - Verify API key is correct
   - Check HTTP request format in Flow
   - Review Klaviyo activity feed for errors

3. **Emails not sending**
   - Confirm flow is active in Klaviyo
   - Check flow filters and conditions
   - Verify customer email is valid

### Debug Mode

Enable debug logging in your TBYB app to track:
- When metafields are set
- HTTP requests to Klaviyo
- Flow trigger responses

## Notes

- **Pending**: Actual Klaviyo API key needs to be obtained and configured
- **Testing**: Full integration testing required once Klaviyo account is set up
- **Compliance**: Ensure email content complies with CAN-SPAM and GDPR requirements
- **Rate Limits**: Monitor Klaviyo API rate limits for high-volume stores

## Related Documentation

- [Postscript Flow Setup](./postscript-flow-setup.md) - SMS reminder setup
- [Shopify Flow Documentation](https://help.shopify.com/en/manual/apps/flow)
- [Klaviyo API Documentation](https://developers.klaviyo.com/en/reference/api_overview)

---

**Last Updated**: June 2, 2025  
**Version**: 1.0  
**Contact**: Technical team for TBYB app configuration