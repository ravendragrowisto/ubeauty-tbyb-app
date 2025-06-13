/**
 * Try Before You Buy (TBYB) Frontend JavaScript
 * Handles TBYB button interactions, eligibility checks, and cart operations
 */

class TBYBManager {
  constructor() {
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
    
    // App URL configuration for API calls
    this.appUrl = 'https://ae6a-2409-40c4-1013-8a25-7c8d-c844-447e-5702.ngrok-free.app';
    
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

      let realSellingPlan = null;
      if (realSellingPlanResponse.ok) {
        const realData = await realSellingPlanResponse.json();
        if (realData.success) {
          realSellingPlan = realData;
          console.log('Real selling plan:', realData.created ? 'created' : 'exists', realData.sellingPlan);
        } else {
          console.warn('Public API error:', realData.message);
        }
      } else {
        console.warn('Failed to create real selling plan via public API, falling back to eligibility check');
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

      if (response.ok) {
        const data = await response.json();
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
        throw new Error('Failed to check eligibility');
      }
    } catch (error) {
      console.error('Error checking eligibility:', error);
      this.showNotAvailable();
    }
  }

  async handleAddSample() {
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
    // Try to get customer ID from various sources
    if (window.customer && window.customer.id) {
      return window.customer.id;
    }
    
    if (window.Shopify && window.Shopify.customer && window.Shopify.customer.id) {
      return window.Shopify.customer.id;
    }

    // Check for customer ID in meta tags
    const customerMeta = document.querySelector('meta[name="customer-id"]');
    if (customerMeta) {
      return customerMeta.getAttribute('content');
    }

    return null;
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