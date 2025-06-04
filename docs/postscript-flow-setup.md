# Postscript Flow Setup for TBYB App

## Overview
This document describes how to configure a Postscript Flow to send SMS reminders for the "Try Before You Buy" (TBYB) app. The Flow triggers when a Shopify order’s `tbyb.trial_start` metafield is updated, sending an SMS on day 7 of the 14-day trial.

## Prerequisites
- Postscript account with API access.
- Shopify store with Shopify Flow enabled.
- TBYB app installed with webhook support.

## Setup Steps
1. **Create a Postscript Campaign**
   - In Postscript, go to **Campaigns**.
   - Click **Create Campaign** and name it `TBYB SMS Reminder`.
   - Set the message content: