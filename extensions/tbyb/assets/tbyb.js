/**
 * Try Before You Buy (TBYB) Frontend JavaScript
 * Handles TBYB button interactions, eligibility checks, and cart operations
 */

class TBYBManager {
  constructor() {
    console.log('🚀 TBYB Manager v2.1.5 initializing...');
    this.container = document.querySelector('.tbyb-container');
    this.button = document.getElementById('tbyb-button');
    this.infoButton = document.getElementById('tbyb-info-btn');
    this.modal = document.getElementById('tbyb-modal');
    this.modalClose = document.getElementById('tbyb-modal-close');
    this.modalBackdrop = document.getElementById('tbyb-modal-backdrop');
    this.modalAddSampleBtn = document.getElementById('tbyb-modal-add-sample');
    this.loadingEl = document.getElementById('tbyb-loading');
    this.notAvailableEl = document.getElementById('tbyb-not-available');
    
    this.productId = null;
    this.variantId = null;
    this.tbybConfig = null;
    this.sellingPlan = null;
    this.isRedirecting = false; // Flag to prevent multiple redirects
    
    // Dynamic App URL configuration for API calls
    this.appUrl = this.getAppUrl();
    
    // Version for cache busting - update this when making changes
    this.version = '2.1.5';
    
    console.log('📡 TBYB App URL configured:', this.appUrl);
    console.log('🔢 TBYB Version:', this.version);
    
    this.init();
  }

  init() {
    if (!this.container) return;
    
    this.productId = this.container.dataset.productId;
    this.variantId = this.container.dataset.variantId;
    
    this.bindEvents();
    this.checkEligibility();
  }

  bindEvents() {
    // Main TBYB button
    if (this.button) {
      this.button.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleAddSample();
      });
    }

    // Info button (opens modal)
    if (this.infoButton) {
      this.infoButton.addEventListener('click', () => this.openModal());
    }

    // Modal events
    if (this.modalClose) {
      this.modalClose.addEventListener('click', () => this.closeModal());
    }
    if (this.modalBackdrop) {
      this.modalBackdrop.addEventListener('click', () => this.closeModal());
    }
    if (this.modalAddSampleBtn) {
      this.modalAddSampleBtn.addEventListener('click', () => {
        this.closeModal();
        this.handleAddSample();
      });
    }

    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal && this.modal.style.display !== 'none') {
        this.closeModal();
      }
    });

    // Variant selection change
    const variantSelectors = document.querySelectorAll('select[name="id"], input[name="id"]');
    variantSelectors.forEach(selector => {
      selector.addEventListener('change', (e) => {
        this.variantId = e.target.value;
        this.container.dataset.variantId = this.variantId;
        this.checkEligibility();
      });
    });

    // Listen for cart changes to refresh eligibility
    document.addEventListener('cart:updated', () => {
      this.checkEligibility();
    });

    // Listen for custom cart refresh events
    document.addEventListener('cart:refresh', () => {
      this.checkEligibility();
    });
  }

  async checkEligibility() {
    try {
      this.showLoading();

      // Get cart token for checking existing samples
      let cartToken = null;
      try {
        const cartResponse = await fetch('/cart.js');
        if (cartResponse.ok) {
          const cartData = await cartResponse.json();
          cartToken = cartData.token;
        }
      } catch (cartError) {
        console.log('Could not get cart token:', cartError);
      }

      // First, try to create or get real selling plan using public API
      const shopDomain = window.Shopify?.shop || window.location.hostname;
      console.log('🌐 Using shop domain:', shopDomain);
      console.log('📦 Product/Variant:', this.productId, '/', this.variantId);
      
      let realSellingPlan = null;
      try {
        const realSellingPlanResponse = await fetch(`${this.appUrl}/app/api/tbyb/public/create-selling-plan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productId: this.productId,
            variantId: this.variantId,
            shopDomain: shopDomain
          })
        });

        console.log('Selling plan API response status:', realSellingPlanResponse.status);

        if (realSellingPlanResponse.ok) {
          const responseText = await realSellingPlanResponse.text();
          console.log('Selling plan API response text:', responseText);
          
          if (responseText && responseText.trim() !== '') {
            try {
              const realData = JSON.parse(responseText);
              if (realData.success) {
                realSellingPlan = realData;
                console.log('✅ Real selling plan:', realData.created ? 'created' : 'exists', realData.sellingPlan);
              } else {
                console.warn('❌ Public API error:', realData.message);
              }
            } catch (parseError) {
              console.error('❌ Failed to parse selling plan response:', parseError);
            }
          } else {
            console.warn('❌ Empty response from selling plan API');
          }
        } else {
          const errorText = await realSellingPlanResponse.text();
          console.warn('❌ Failed to create real selling plan via public API:', realSellingPlanResponse.status, errorText);
        }
      } catch (sellingPlanError) {
        console.error('❌ Error calling selling plan API:', sellingPlanError);
      }

      // Get eligibility and configuration using public API
      const response = await fetch(`${this.appUrl}/app/api/tbyb/public/check-eligibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: this.productId,
          variantId: this.variantId,
          customerId: this.getCustomerId(),
          shopDomain: shopDomain,
          cartToken: cartToken
        })
      });

      console.log('Eligibility API response status:', response.status);
      console.log('Eligibility API response headers:', response.headers);

      if (response.ok) {
        const responseText = await response.text();
        console.log('Eligibility API response text:', responseText);
        
        if (!responseText || responseText.trim() === '') {
          throw new Error('Empty response from eligibility API');
        }
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse eligibility response:', parseError);
          throw new Error('Invalid JSON response from eligibility API');
        }
        this.tbybConfig = data.config;
        
        // Priority 1: Use real selling plan from creation if successful
        if (realSellingPlan && realSellingPlan.sellingPlan && realSellingPlan.success) {
          this.sellingPlan = realSellingPlan.sellingPlan;
          this.tbybConfig = {
            ...this.tbybConfig,
            ...realSellingPlan.config,
            isRealSellingPlan: true
          };
          console.log('Using newly created/existing real selling plan:', this.sellingPlan);
        }
        // Priority 2: Use real selling plan from eligibility check if available
        else if (data.config.isRealSellingPlan && data.sellingPlan && !data.sellingPlan.needsCreation) {
          this.sellingPlan = data.sellingPlan;
          this.tbybConfig = {
            ...this.tbybConfig,
            isRealSellingPlan: true
          };
          console.log('Using existing real selling plan from eligibility:', this.sellingPlan);
        }
        // Priority 3: Fall back to mock only if real selling plan creation failed
        else {
          this.sellingPlan = data.sellingPlan;
          this.tbybConfig = {
            ...this.tbybConfig,
            isRealSellingPlan: false
          };
          console.warn('Using mock selling plan - real selling plan creation failed!');
        }

        this.updateUI();

        if (data.eligible) {
          this.showAvailable();
        } else {
          // Handle different ineligibility reasons
          if (data.ineligibilityReason) {
            this.showNotAvailable(data.ineligibilityReason);
          } else {
            this.showNotAvailable();
          }
        }
      } else {
        const errorText = await response.text();
        console.error('❌ Eligibility API failed with status:', response.status);
        console.error('❌ Error response:', errorText);
        throw new Error(`Eligibility API failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('❌ Error checking TBYB eligibility:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        appUrl: this.appUrl,
        productId: this.productId,
        variantId: this.variantId
      });
      this.showNotAvailable();
    }
  }

  async handleAddSample() {
    // Prevent multiple login redirects
    if (this.isRedirecting) {
      return;
    }
    
    // Check if customer is logged in first
    if (!this.isCustomerLoggedIn()) {
      this.isRedirecting = true;
      this.showLoginRequiredAndRedirect();
      return;
    }

    if (!this.tbybConfig || !this.sellingPlan) {
      alert('TBYB configuration not loaded. Please try again.');
      return;
    }

    this.setButtonLoading(true);

    try {
      // Check cart eligibility before adding sample
      const cartEligibility = await this.checkCartEligibility();
      if (!cartEligibility.eligible) {
        let message = '';
        switch (cartEligibility.reason) {
          case 'sample_already_in_cart_same_product':
            message = 'A sample for this product is already in your cart.';
            break;
          case 'sample_already_in_cart_different_product':
            message = 'You can only order one sample at a time. Please complete your current sample order first.';
            break;
          default:
            message = 'Sample not available at this time.';
        }
        alert(message);
        this.setButtonLoading(false);
        return;
      }

      // Prepare cart data
      const cartData = {
        id: this.variantId,
        quantity: 1,
        properties: {
          '_tbyb_sample': 'true',
          '_tbyb_trial_days': this.tbybConfig.trialDays,
          '_tbyb_deposit': this.tbybConfig.depositAmount,
          '_tbyb_plan_name': this.sellingPlan.name,
          '_tbyb_plan_description': this.sellingPlan.description,
          '_tbyb_note': `SAMPLE: Pay only $${this.tbybConfig.depositAmount} deposit now, ${this.tbybConfig.trialDays} day trial`,
          'TBYB Sample': `$${this.tbybConfig.depositAmount} deposit - ${this.tbybConfig.trialDays} day trial`,
          'Sample Type': 'Try Before You Buy',
          'Deposit Amount': `$${this.tbybConfig.depositAmount}`,
          'Trial Period': `${this.tbybConfig.trialDays} days`
        }
      };

      // If we have a real selling plan, use it
      if (this.tbybConfig.isRealSellingPlan && this.sellingPlan.id && !this.sellingPlan.id.includes('mock')) {
        // Extract numeric ID from GraphQL ID (gid://shopify/SellingPlan/123456 -> 123456)
        const numericId = this.sellingPlan.id.split('/').pop();
        cartData.selling_plan = parseInt(numericId, 10);
        console.log('Adding to cart with real selling plan ID:', cartData.selling_plan);
      } else {
        console.log('Adding to cart without selling plan (using properties only)');
      }

      // Add sample to cart using Shopify Cart API
      const cartResponse = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cartData)
      });

      if (cartResponse.ok) {
        const cartResponseData = await cartResponse.json();
        
        // Update cart note to indicate TBYB pricing
        try {
          await fetch('/cart/update.js', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              note: `TBYB Sample Order - ${this.tbybConfig.isRealSellingPlan ? 'Selling plan pricing applies' : 'Deposit pricing indicated in cart'}.`
            })
          });
        } catch (noteError) {
          console.log('Could not update cart note:', noteError);
        }

        // Show success message
        this.showSuccess();
        
        // Force refresh cart contents first, then open drawer
        try {
          // Wait for cart to be updated on Shopify's servers
          await new Promise(resolve => setTimeout(resolve, 800));
          
          // Force reload cart contents
          const cartData = await this.refreshCartContents();
          
          // Wait a bit more for the refresh to take effect
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Try different cart drawer opening methods
          let drawerOpened = false;
          
          // Method 1: Try Shopify's cart drawer
          if (typeof window.CartDrawer !== 'undefined' && window.CartDrawer.open) {
            window.CartDrawer.open();
            drawerOpened = true;
            console.log('Opened cart via window.CartDrawer');
          }
          // Method 2: Try Dawn theme cart drawer
          else if (typeof window.cartDrawer !== 'undefined' && window.cartDrawer.open) {
            window.cartDrawer.open();
            drawerOpened = true;
            console.log('Opened cart via window.cartDrawer');
          }
          // Method 3: Try cart drawer via CSS selector
          else {
            const cartDrawerSelectors = [
              '[data-cart-drawer]', 
              '.cart-drawer-toggle', 
              '.js-cart-drawer-open', 
              '.header__icon--cart',
              '.cart-link',
              '.cart-icon',
              '[data-cart-open]'
            ];
            
            let cartDrawerBtn = null;
            for (const selector of cartDrawerSelectors) {
              cartDrawerBtn = document.querySelector(selector);
              if (cartDrawerBtn) break;
            }
            
            if (cartDrawerBtn) {
              cartDrawerBtn.click();
              drawerOpened = true;
              console.log('Opened cart via button click:', cartDrawerBtn);
            }
          }
          
          // Method 4: If no drawer opened, trigger refresh events and show message
          if (!drawerOpened) {
            document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', {
              bubbles: true,
              detail: cartResponseData
            }));
            
            // Show success message with cart info
            setTimeout(() => {
              alert(`Sample added to cart successfully! Items in cart: ${cartData ? cartData.item_count : cartResponseData.item_count}. Go to cart to checkout.`);
            }, 200);
          } else {
            // Wait a moment then force another refresh to ensure pricing is correct
            setTimeout(async () => {
              try {
                await this.refreshCartContents();
                console.log('Secondary cart refresh completed');
              } catch (e) {
                console.log('Secondary refresh failed:', e);
              }
            }, 1000);
          }
        } catch (drawerError) {
          console.log('Cart drawer not available, showing success message:', drawerError);
          alert(`Sample added to cart successfully! Go to cart to checkout.`);
        }

        // Track event
        this.trackEvent('tbyb_sample_added', {
          product_id: this.productId,
          variant_id: this.variantId,
          deposit_amount: this.tbybConfig.depositAmount,
          has_real_selling_plan: this.tbybConfig.isRealSellingPlan || false,
          selling_plan_id: this.sellingPlan.id
        });

      } else {
        const errorData = await cartResponse.json();
        throw new Error(errorData.message || 'Failed to add sample to cart');
      }

    } catch (error) {
      console.error('Error adding sample to cart:', error);
      alert('Failed to add sample to cart: ' + error.message);
    } finally {
      this.setButtonLoading(false);
    }
  }

  showLoading() {
    if (this.loadingEl) this.loadingEl.style.display = 'block';
    if (this.container) this.container.style.opacity = '0.6';
  }

  showAvailable() {
    if (this.loadingEl) this.loadingEl.style.display = 'none';
    if (this.notAvailableEl) this.notAvailableEl.style.display = 'none';
    if (this.container) this.container.style.opacity = '1';
    if (this.button) this.button.disabled = false;
  }

  showNotAvailable(reason = null) {
    if (this.loadingEl) this.loadingEl.style.display = 'none';
    if (this.notAvailableEl) this.notAvailableEl.style.display = 'block';
    if (this.container) this.container.style.opacity = '0.6';
    if (this.button) this.button.disabled = true;
    
    // Set appropriate error message based on reason
    if (reason && this.notAvailableEl) {
      let message = '';
      switch (reason) {
        case 'sample_already_in_cart_same_product':
          message = 'A sample for this product is already in your cart.';
          break;
        case 'sample_already_in_cart_different_product':
          message = 'You can only order one sample at a time. Please complete your current sample order first.';
          break;
        case 'max_samples_reached':
          message = 'You have reached the maximum of 3 samples for this product.';
          break;
        default:
          message = 'Sample not available at this time.';
      }
      this.notAvailableEl.textContent = message;
    }
  }

  showSuccess() {
    if (this.button) {
      const originalText = this.button.querySelector('.tbyb-btn-text').textContent;
      this.button.querySelector('.tbyb-btn-text').textContent = 'Added to Cart!';
      this.button.classList.add('tbyb-btn-success');
      
      setTimeout(() => {
        this.button.querySelector('.tbyb-btn-text').textContent = originalText;
        this.button.classList.remove('tbyb-btn-success');
      }, 2000);
    }
  }

  updateUI() {
    if (!this.tbybConfig) return;

    // Update deposit amount
    const depositElements = document.querySelectorAll('#tbyb-deposit-amount');
    depositElements.forEach(el => {
      el.textContent = this.tbybConfig.depositAmount;
    });

    // Update trial days
    const trialElements = document.querySelectorAll('.tbyb-trial');
    trialElements.forEach(el => {
      el.textContent = `${this.tbybConfig.trialDays} day trial`;
    });
  }

  setButtonLoading(loading) {
    if (!this.button) return;

    this.button.dataset.loading = loading.toString();
    this.button.disabled = loading;

    if (loading) {
      this.button.querySelector('.tbyb-btn-text').style.opacity = '0';
      this.button.querySelector('.tbyb-btn-loader').style.opacity = '1';
    } else {
      this.button.querySelector('.tbyb-btn-text').style.opacity = '1';
      this.button.querySelector('.tbyb-btn-loader').style.opacity = '0';
    }
  }

  openModal() {
    if (this.modal) {
      this.modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      
      // Focus trap
      const focusableElements = this.modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  }

  closeModal() {
    if (this.modal) {
      this.modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  getCustomerId() {
    console.log('🔍 Checking customer login status...');
    
    // Method 1: Try window.customer
    if (window.customer && window.customer.id) {
      console.log('✅ Found customer ID in window.customer:', window.customer.id);
      return window.customer.id;
    } else {
      console.log('❌ window.customer not found or no ID:', window.customer);
    }
    
    // Method 2: Try window.Shopify.customer
    if (window.Shopify && window.Shopify.customer && window.Shopify.customer.id) {
      console.log('✅ Found customer ID in window.Shopify.customer:', window.Shopify.customer.id);
      return window.Shopify.customer.id;
    } else {
      console.log('❌ window.Shopify.customer not found or no ID:', window.Shopify?.customer);
    }

    // Method 3: Check for customer ID in meta tags
    const customerMeta = document.querySelector('meta[name="customer-id"]');
    if (customerMeta && customerMeta.getAttribute('content')) {
      const customerId = customerMeta.getAttribute('content');
      console.log('✅ Found customer ID in meta tag:', customerId);
      return customerId;
    } else {
      console.log('❌ Customer ID meta tag not found');
    }

    // Method 4: Check for customer info in liquid variables (theme-specific)
    if (typeof customerLoggedIn !== 'undefined' && customerLoggedIn) {
      console.log('✅ Customer logged in via liquid variable');
      // Try to find customer ID in other global variables
      if (typeof customerId !== 'undefined' && customerId) {
        console.log('✅ Found customer ID in global variable:', customerId);
        return customerId;
      }
    }

    // Method 5: Check for customer data in theme variables
    if (window.theme && window.theme.customer && window.theme.customer.id) {
      console.log('✅ Found customer ID in theme object:', window.theme.customer.id);
      return window.theme.customer.id;
    }

    // Method 6: Try parsing from page content (last resort)
    const bodyContent = document.body.innerHTML;
    const customerMatch = bodyContent.match(/customer['"]\s*:\s*\{[^}]*id['"]\s*:\s*['"]*(\d+)['"]*[^}]*\}/i);
    if (customerMatch && customerMatch[1]) {
      console.log('✅ Found customer ID in page content:', customerMatch[1]);
      return customerMatch[1];
    }

    console.log('❌ No customer ID found - customer appears to be logged out');
    return null;
  }

  /**
   * Check if customer is logged in
   * @returns {boolean} True if customer is logged in, false otherwise
   */
  isCustomerLoggedIn() {
    const customerId = this.getCustomerId();
    const isLoggedIn = customerId !== null && customerId !== undefined && customerId !== '' && customerId !== '0';
    
    console.log('🔐 Customer login status:', {
      customerId: customerId,
      isLoggedIn: isLoggedIn,
      customerObject: window.customer,
      shopifyCustomer: window.Shopify?.customer
    });
    
    return isLoggedIn;
  }

  /**
   * Get localized text using i18next or fallback to English
   * @param {string} key - Translation key (e.g., 'tbyb.login_required')
   * @param {string} fallback - Fallback text if translation not found
   * @returns {string} Localized text
   */
  getLocalizedText(key, fallback) {
    // Try i18next first
    if (typeof i18next !== 'undefined' && i18next.t) {
      const translation = i18next.t(key);
      if (translation && translation !== key) {
        return translation;
      }
    }

    // Try Shopify's theme translations
    if (typeof window.theme !== 'undefined' && window.theme.strings && window.theme.strings[key]) {
      return window.theme.strings[key];
    }

    // Try accessing nested translation keys
    const keyParts = key.split('.');
    let translation = window;
    
    // Check if translations are available in window.translations
    if (window.translations) {
      translation = window.translations;
      for (const part of keyParts) {
        if (translation && typeof translation === 'object' && translation[part]) {
          translation = translation[part];
        } else {
          translation = null;
          break;
        }
      }
      if (typeof translation === 'string') {
        return translation;
      }
    }

    // Return fallback text
    return fallback;
  }

  /**
   * Show login required message and redirect to login page
   */
  showLoginRequiredAndRedirect() {
    const loginMessage = this.getLocalizedText('tbyb.login_required', 'Please log in to try a sample');
    
    // Show the login required message once
    alert(loginMessage);
    
    // Get current page URL for return_to parameter
    const currentUrl = window.location.href;
    const returnToParam = encodeURIComponent(currentUrl);
    
    // Redirect immediately after the alert is dismissed
    window.location.href = `/account/login?return_to=${returnToParam}`;
  }

  /**
   * Get the app URL dynamically for API calls
   * This method tries multiple approaches to find the correct ngrok URL
   */
  getAppUrl() {
    // For development, try to determine from browser environment
    if (window.location.hostname.includes('myshopify.com')) {
      // We're on a Shopify store, try to detect development URLs
      
      // Method 1: Check if there's a global app URL variable
      if (window.TBYB_APP_URL) {
        console.log('🔧 Using configured TBYB_APP_URL:', window.TBYB_APP_URL);
        return window.TBYB_APP_URL;
      }
      
      // Method 2: Try common ngrok patterns with current date/session
      const commonUrls = [
        'https://asia-reporter-presents-philadelphia.trycloudflare.com', // Current working URL
        'https://34d6-2409-40c4-17c-4e05-84c7-cf04-9960-d56f.ngrok-free.app', // Previous working URL
      ];
      
      // For now, return the most recent working URL
      // TODO: Implement dynamic detection in future versions
      const currentUrl = commonUrls[0];
      console.log('🔧 Using fallback development URL:', currentUrl);
      return currentUrl;
    }
    
    // For production, use relative URLs or configured production URL
    if (window.TBYB_PRODUCTION_URL) {
      return window.TBYB_PRODUCTION_URL;
    }
    
    // Default fallback
    return 'https://asia-reporter-presents-philadelphia.trycloudflare.com';
  }

  trackEvent(eventName, properties = {}) {
    // Google Analytics 4
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, properties);
    }

    // Facebook Pixel
    if (typeof fbq !== 'undefined') {
      fbq('trackCustom', eventName, properties);
    }

    // Shopify Analytics
    if (typeof ShopifyAnalytics !== 'undefined') {
      ShopifyAnalytics.lib.track(eventName, properties);
    }

    // Console log for debugging
    console.log('TBYB Event:', eventName, properties);
  }

  async refreshCartContents() {
    try {
      // Get current cart state with selling plan information
      const cartResponse = await fetch('/cart.js');
      const cartData = await cartResponse.json();
      
      console.log('Cart data after refresh:', cartData);
      
      // Force update cart count displays first
      const cartCountElements = document.querySelectorAll('[data-cart-count], .cart-count, .cart-counter, .header__cart-count');
      cartCountElements.forEach(el => {
        if (el) {
          el.textContent = cartData.item_count || '0';
        }
      });
      
      // Close any existing cart drawer first
      const existingDrawer = document.querySelector('.cart-drawer, .drawer');
      if (existingDrawer && existingDrawer.classList.contains('is-open')) {
        existingDrawer.classList.remove('is-open');
      }
      
      // Try to reload cart drawer content completely from server
      const cartDrawerSelectors = [
        '.cart-drawer__content', 
        '.drawer__content', 
        '.cart__content',
        '.cart-drawer__inner',
        '.drawer__inner',
        '[data-cart-drawer-content]'
      ];
      
      let cartDrawerContent = null;
      for (const selector of cartDrawerSelectors) {
        cartDrawerContent = document.querySelector(selector);
        if (cartDrawerContent) break;
      }
      
      if (cartDrawerContent) {
        try {
          // Try different cart view endpoints
          const cartViewEndpoints = [
            '/cart?view=drawer',
            '/cart?section_id=cart-drawer', 
            '/cart?sections=cart-drawer',
            '/cart.html'
          ];
          
          let cartHtml = null;
          for (const endpoint of cartViewEndpoints) {
            try {
              const cartHtmlResponse = await fetch(endpoint);
              if (cartHtmlResponse.ok) {
                cartHtml = await cartHtmlResponse.text();
                break;
              }
            } catch (e) {
              console.log(`Failed to fetch from ${endpoint}:`, e);
            }
          }
          
          if (cartHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = cartHtml;
            
            // Try to find the updated content
            let newContent = null;
            for (const selector of cartDrawerSelectors) {
              newContent = tempDiv.querySelector(selector);
              if (newContent) break;
            }
            
            if (newContent) {
              cartDrawerContent.innerHTML = newContent.innerHTML;
              console.log('Cart drawer content updated from server');
            }
          }
        } catch (contentError) {
          console.log('Could not update cart drawer content:', contentError);
        }
      }
      
      return cartData;
    } catch (error) {
      console.error('Error refreshing cart contents:', error);
      return null;
    }
  }

  // Helper method to check if cart has existing TBYB samples
  async checkCartEligibility() {
    try {
      const cartResponse = await fetch('/cart.js');
      if (!cartResponse.ok) return { eligible: true };
      
      const cartData = await cartResponse.json();
      
      // Check for existing TBYB samples
      for (const item of cartData.items) {
        if (item.properties && item.properties._tbyb_sample === 'true') {
          const existingProductId = item.product_id ? item.product_id.toString() : null;
          
          if (existingProductId === this.productId.toString()) {
            return { 
              eligible: false, 
              reason: 'sample_already_in_cart_same_product' 
            };
          } else {
            return { 
              eligible: false, 
              reason: 'sample_already_in_cart_different_product' 
            };
          }
        }
      }
      
      return { eligible: true };
    } catch (error) {
      console.log('Error checking cart eligibility:', error);
      return { eligible: true }; // Allow if we can't check
    }
  }
}

// Initialize TBYB when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new TBYBManager();
});

// Also initialize if DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new TBYBManager();
  });
} else {
  new TBYBManager();
} 