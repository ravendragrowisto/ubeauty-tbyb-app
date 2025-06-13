# Postscript Flow Setup for TBYB

This document outlines how to set up Postscript SMS flows for Try Before You Buy (TBYB) trial reminders and confirmations.

## Prerequisites

- Active Postscript account
- Postscript API key
- TBYB app installed and configured
- Access to Shopify Flow (Shopify Plus required)
- SMS compliance setup complete

## Overview

The TBYB Postscript integration uses Shopify Flow to trigger SMS campaigns based on order metafield updates. When a customer orders a sample, the app sets metafields on the order that trigger Postscript flows for trial reminders via SMS.

## Setup Steps

### 1. Get Postscript API Key

1. Log into your Postscript account
2. Go to Settings > API & Webhooks
3. Generate a new API key or copy existing one
4. Add it to your app's environment variables as `POSTSCRIPT_API_KEY`

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

#### Condition: Check SMS Consent
- **Field**: Customer accepts marketing
- **Condition**: equals `true`

#### Action: HTTP Request to Postscript
- **Method**: POST
- **URL**: `https://api.postscript.io/v2/campaigns/trigger`
- **Headers**:
  ```
  Authorization: Bearer YOUR_POSTSCRIPT_API_KEY
  Content-Type: application/json
  ```
- **Body**:
  ```json
  {
    "campaign_name": "tbyb_trial_started",
    "subscriber": {
      "phone_number": "{{ order.customer.phone }}",
      "email": "{{ order.customer.email }}",
      "first_name": "{{ order.customer.firstName }}",
      "last_name": "{{ order.customer.lastName }}"
    },
    "properties": {
      "order_id": "{{ order.id }}",
      "trial_start_date": "{{ order.metafield.tbyb.trial_start }}",
      "trial_end_date": "{{ order.metafield.tbyb.trial_end }}",
      "deposit_amount": "{{ order.metafield.tbyb.deposit_amount }}",
      "product_title": "{{ order.lineItems.first.title }}",
      "trial_days_remaining": "14"
    }
  }
  ```

### 3. Create Postscript SMS Campaigns

#### Campaign 1: Trial Welcome SMS

**Campaign Name**: `tbyb_trial_started`
**Trigger**: API trigger from Shopify Flow
**Message**:
```
Hi {{ first_name }}! 🎉 Your {{ product_title }} sample is on its way! 

You have 14 days to try it. We'll remind you before your trial ends.

Questions? Reply HELP
Stop? Reply STOP
```

#### Campaign 2: Mid-Trial Check-in

**Campaign Name**: `tbyb_mid_trial`
**Trigger**: Scheduled 7 days after trial start
**Message**:
```
Hey {{ first_name }}! How's your {{ product_title }} sample? 💫

You have 7 days left in your trial. 

Love it? You'll be charged ${{ remaining_amount }} automatically unless you cancel.

Manage your trial: [ACCOUNT_LINK]
```

#### Campaign 3: Trial Ending Soon

**Campaign Name**: `tbyb_trial_ending`
**Trigger**: Scheduled 2 days before trial end
**Message**:
```
⏰ {{ first_name }}, your {{ product_title }} trial ends in 2 days!

Keep it: Do nothing, we'll charge the remaining ${{ remaining_amount }}
Cancel: Reply CANCEL or visit [ACCOUNT_LINK]

Questions? Reply HELP
```

#### Campaign 4: Final Reminder

**Campaign Name**: `tbyb_final_reminder`
**Trigger**: Scheduled day of trial end
**Message**:
```
🚨 FINAL NOTICE: {{ first_name }}, your {{ product_title }} trial ends TODAY!

Last chance to cancel: [ACCOUNT_LINK]
Keep it: We'll process payment tonight and ship your full-size product

Need help? Reply HELP
```

#### Campaign 5: Order Confirmed

**Campaign Name**: `tbyb_order_confirmed`
**Trigger**: API trigger when customer confirms
**Message**:
```
🎉 Thanks {{ first_name }}! Your {{ product_title }} order is confirmed!

Your full-size product will ship within 2-3 business days. 

Track your order: [TRACKING_LINK]
```

#### Campaign 6: Trial Cancelled

**Campaign Name**: `tbyb_trial_cancelled`
**Trigger**: API trigger when customer cancels
**Message**:
```
Hi {{ first_name }}, we've cancelled your {{ product_title }} trial as requested.

Return your sample using the prepaid label in the box.

Thanks for trying us! ✨
```

### 4. Set Up Additional Flows

Create additional Shopify Flows for other events:

#### Flow 2: Trial Ending Reminder
- **Trigger**: Scheduled task (daily)
- **Condition**: Orders with trial ending in 2 days
- **Action**: Trigger `tbyb_trial_ending` campaign

#### Flow 3: Final Reminder
- **Trigger**: Scheduled task (daily)
- **Condition**: Orders with trial ending today
- **Action**: Trigger `tbyb_final_reminder` campaign

#### Flow 4: Order Confirmed
- **Trigger**: Order metafield `tbyb.status` updated to `CONFIRMED`
- **Action**: Trigger `tbyb_order_confirmed` campaign

#### Flow 5: Trial Cancelled
- **Trigger**: Order metafield `tbyb.status` updated to `CANCELLED`
- **Action**: Trigger `tbyb_trial_cancelled` campaign

### 5. SMS Compliance Setup

#### Opt-in Collection
- Ensure customers opt-in to SMS during checkout
- Include clear language about TBYB SMS notifications
- Store opt-in consent in customer metafields

#### Required Disclaimers
Add to all SMS messages:
- Reply HELP for help
- Reply STOP to opt out
- Message and data rates may apply

#### Opt-out Handling
Configure automatic opt-out for:
- STOP, CANCEL, UNSUBSCRIBE keywords
- Sync opt-outs with Shopify customer records

### 6. Template Variables

Available variables in Postscript messages:

- `{{ first_name }}` - Customer first name
- `{{ last_name }}` - Customer last name
- `{{ product_title }}` - Product name
- `{{ deposit_amount }}` - Deposit paid
- `{{ remaining_amount }}` - Amount due if confirmed
- `{{ trial_end_date }}` - Trial expiration date
- `{{ order_id }}` - Shopify order ID

### 7. Testing

1. Create a test customer with valid phone number
2. Ensure SMS consent is enabled
3. Place a test TBYB order
4. Verify Shopify Flow triggers
5. Check Postscript dashboard for campaign sends
6. Confirm SMS messages are received

## Advanced Features

### Automated Flows

Set up automated message sequences:

1. **Welcome Series**: Multi-message onboarding
2. **Abandoned Trial**: Re-engage customers who haven't decided
3. **Upsell Series**: Promote related products to confirmed customers
4. **Feedback Collection**: Post-trial satisfaction surveys

### Segmentation

Create Postscript segments:

- **Active TBYB Trials**: Customers with ongoing trials
- **TBYB Converters**: Customers who confirmed orders
- **TBYB Returners**: Customers with multiple trials
- **High-Value TBYB**: Customers with high-value confirmations

### Personalization

- Dynamic product recommendations
- Personalized timing based on customer timezone
- Behavioral triggers based on app interactions
- Custom fields for product categories

### A/B Testing

Test message variations:
- Subject lines and emoji usage
- Message timing (morning vs evening)
- Call-to-action language
- Message length and format

## Troubleshooting

### Common Issues

1. **Messages not sending**
   - Verify API key is correct
   - Check customer phone number format
   - Confirm SMS consent is enabled
   - Review Postscript delivery logs

2. **Flow not triggering**
   - Check metafield namespace and key
   - Verify Shopify Flow is active
   - Ensure conditions are met

3. **Opt-out not working**
   - Check keyword configuration
   - Verify webhook setup for opt-outs
   - Review compliance settings

### Monitoring

Track these metrics:
- SMS delivery rates
- Click-through rates on links
- Conversion rates (trial to purchase)
- Opt-out rates
- Customer satisfaction scores

### Compliance Monitoring

- Regular audit of opt-in processes
- Monitor opt-out rates for compliance
- Review message content for regulations
- Track consent changes

## Rate Limits and Costs

### Postscript Limits
- API rate limits: 100 requests/minute
- Message sending limits based on plan
- Character limits: 160 characters per SMS

### Cost Optimization
- Use concatenated messages sparingly
- Optimize message timing
- Segment audiences for relevance
- Monitor delivery success rates

## Notes

- **Pending**: Actual Postscript API key needs to be obtained
- **Testing**: Full SMS integration testing required
- **Compliance**: Ensure all SMS comply with TCPA and local regulations
- **Localization**: Consider time zones for message scheduling

## Related Documentation

- [Klaviyo Flow Setup](./klaviyo-flow-setup.md) - Email reminder setup
- [Shopify Flow Documentation](https://help.shopify.com/en/manual/apps/flow)
- [Postscript API Documentation](https://docs.postscript.io/)
- [SMS Compliance Guide](https://help.postscript.io/hc/en-us/articles/360043750834)

---

**Last Updated**: June 2, 2025  
**Version**: 1.0  
**Contact**: Technical team for TBYB app configuration