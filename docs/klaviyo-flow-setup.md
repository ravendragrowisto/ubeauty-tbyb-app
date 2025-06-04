# Klaviyo Flow Setup for TBYB App

## Overview
This document describes how to configure a Klaviyo Flow to send email reminders for the "Try Before You Buy" (TBYB) app. The Flow triggers when a Shopify order’s `tbyb.trial_start` metafield is updated, sending a reminder email on day 7 of the 14-day trial.

## Prerequisites
- Klaviyo account with API access.
- Shopify store with Shopify Flow enabled.
- TBYB app installed with webhook support.

## Setup Steps
1. **Create a Klaviyo Metric**
   - In Klaviyo, go to **Analytics > Metrics**.
   - Click **Create Metric** and name it `TBYB Reminder`.
   - Set the metric type to `API Event`.
   - Save the metric.

2. **Create an Email Template**
   - Go to **Content > Templates**.
   - Create a new template named `TBYB Reminder Email`.
   - Use the following placeholder content:


   - Save the template.

3. **Configure Shopify Flow**
- In Shopify Admin, go to **Apps > Shopify Flow**.
- Click **Create Workflow** and name it `TBYB Email Reminder`.
- **Trigger**: Select `Order Metafield Updated`.
- Namespace: `tbyb`
- Key: `trial_start`
- **Action**: Add `Send HTTP Request`.
- URL: `https://a.klaviyo.com/api/track`
- Method: POST
- Headers: `{ "Authorization": "Klaviyo-API-Key <your-private-key>" }`
- Body:
  ```json
  {
    "event": "TBYB Reminder",
    "customer_properties": {
      "email": "{{ order.customer.email }}"
    },
    "properties": {
      "order_id": "{{ order.id }}",
      "trial_end": "{{ order.metafields.tbyb.trial_start | date: '%s' | plus: 1209600 }}"
    }
  }