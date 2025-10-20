/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// --- CONFIGURATION ---
// The Supabase URL and anon key are safe to be exposed in client-side code.
// Supabase security is managed by Row Level Security (RLS) policies
// on your database, which have already been configured.
const SUPABASE_URL = "https://zycnnjeofyvybaykrccg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5Y25uamVvZnl2eWJheWtyY2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNzk0MjcsImV4cCI6MjA3NTY1NTQyN30.M4QENLl7BfMx9hpMcIBqweb_P6Qr1yhz7NSRC5S66QA";
const BUCKET_NAME = "order-images";
// VAPID key for web push notifications. This is a public key and is safe to expose.
// It is used to identify the application server to the push service.
// BƯỚC QUAN TRỌNG: Thay thế chuỗi dưới đây bằng VAPID Public Key của bạn sau khi tạo ở Bước 2 của hướng dẫn.
const VAPID_PUBLIC_KEY = 'BBEqEezyeg024ZozkTaMs7R9GLScPdjvwMcRdZ9EJXVrvvs0ve8UHeT0dppChHmw7C6MGiyS5Q3jOv33jUf0OGg';

const { createClient } = (window as any).supabase;
// Initialize the Supabase client. Session persistence is enabled to keep the
// user logged in across page reloads.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    // Explicitly set localStorage for session persistence to ensure session 
    // stability across browser tabs and reloads, as recommended in the analysis.
    storage: localStorage,
    // Use a custom storage key to avoid potential conflicts.
    storageKey: 'donhangtem-auth-v1'
  }
});

// --- DEBUGGING ---
// Extract project ID from URL for clarity in logs
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
console.log(`Connecting to Supabase project ID: ${projectRef}`);

// --- DOM ELEMENT SELECTORS ---
const dom = {
  body: document.body,
  loginBtn: document.getElementById("login-btn")!,
  logoutBtn: document.getElementById("logout-btn")!,
  addOrderBtn: document.getElementById("add-order-btn")!,
  enableNotificationsBtn: document.getElementById("enable-notifications-btn") as HTMLButtonElement,
  loginModal: document.getElementById("login-modal")!,
  orderModal: document.getElementById("order-modal")!,
  reviewModal: document.getElementById("review-modal")!,
  confirmModal: document.getElementById("confirm-modal")!,
  closeLoginModalBtn: document.getElementById("close-login-modal-btn")!,
  closeOrderModalBtn: document.getElementById("close-modal-btn")!,
  closeReviewModalBtn: document.getElementById("close-review-modal-btn")!,
  confirmModalCancelBtn: document.getElementById("confirm-modal-cancel-btn")!,
  confirmModalConfirmBtn: document.getElementById("confirm-modal-confirm-btn")!,
  loginForm: document.getElementById("login-form") as HTMLFormElement,
  orderForm: document.getElementById("order-form") as HTMLFormElement,
  reviewForm: document.getElementById("review-form") as HTMLFormElement,
  searchInput: document.getElementById("search-input") as HTMLInputElement,
  globalError: document.getElementById("global-error")!,
  connectionStatus: document.getElementById("connection-status")!,
  connectionStatusText: document.querySelector(
    "#connection-status .status-text"
  )!,
  userDisplay: document.getElementById("user-display")!,
  userEmail: document.getElementById("user-email")!,
  columns: {
    inProduction: document.getElementById("in-production-orders")!,
    waiting: document.getElementById("waiting-orders")!,
    completed: document.getElementById("completed-orders")!,
  },
};

// --- APPLICATION STATE ---
let state = {
  orders: [] as any[],
  draggedCard: null as HTMLElement | null,
  editingOrderId: null as string | number | null,
  reviewingOrderId: null as string | number | null,
  confirmAction: null as (() => void) | null,
  activelyProducing: new Set<string | number>(), // Track 'actively producing' state
  sortConfig: {
      inProduction: { key: 'priority', direction: 'asc' },
      waiting: { key: 'createdAt', direction: 'desc' },
      completed: { key: 'completedAt', direction: 'desc' },
  } as { [key: string]: { key: string, direction: string } },
};

// --- MAIN APP LOGIC ---

/**
 * Creates an HTML element for a single order.
 * @param order The order object from Supabase.
 * @param {number} [priority] The calculated priority number for urgent orders.
 * @returns {HTMLElement} The created order card element.
 */
function createOrderCard(order: any, priority?: number): HTMLElement {
  const card = document.createElement("div");
  card.className = "order-card";
  card.id = `order-${order.id}`;
  // Drag and drop is only enabled for authenticated users
  card.draggable = dom.body.classList.contains('role-authenticated');
  card.dataset.id = order.id;
  card.dataset.status = order.status;
  
  const isActivelyProducing = state.activelyProducing.has(order.id);

  if (order.is_urgent && order.status !== 'completed') {
    card.classList.add("urgent");
  }

  const deliveryDate = order.delivery_date
    ? new Date(order.delivery_date).toLocaleDateString("vi-VN")
    : "N/A";
  const completedAt = order.completed_at
    ? new Date(order.completed_at).toLocaleDateString("vi-VN")
    : "";

  const statusMap: { [key: string]: string } = {
      inProduction: "Đang sản xuất",
      waiting: "Chờ",
      completed: "Hoàn thành",
  };
  let statusText = statusMap[order.status] || order.status;
  if (order.status === 'inProduction' && isActivelyProducing) {
      statusText = "Đang làm";
  }

  card.innerHTML = `
    <!-- EDIT BUTTON -->
    <button class="edit-btn" aria-label="Sửa đơn hàng">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
    </button>
    
    <!-- COMPLETE BUTTON -->
    <button class="complete-btn" aria-label="Hoàn thành đơn hàng">✓</button>

    <!-- DELETE BUTTON (Authenticated Users Only) -->
    <button class="delete-btn" aria-label="Xóa đơn hàng">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
    </button>

    ${(order.is_urgent && order.status !== 'completed') ? `<div class="priority-badge">${priority || '!'}</div>` : ""}
    ${
      order.image_url
        ? `<div class="image-container">
            <img src="${order.image_url}" alt="Hình ảnh ${order.name}" draggable="false">
            <button class="copy-image-btn" aria-label="Sao chép hình ảnh">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 011-1h6a1 1 0 011 1v1a1 1 0 01-1 1H8a1 1 0 01-1-1V3z"></path><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2H5z"></path></svg>
            </button>
           </div>`
        : ""
    }
    <div class="order-card-content">
      <div class="order-card-header">
        <p class="order-card-factory">${order.factory}</p>
        <span class="order-status ${isActivelyProducing ? 'status-actively-producing' : `status-${order.status.toLowerCase()}`}">${
            statusText
        }</span>
      </div>
      <h3 class="order-card-name">${order.name}</h3>
      <div class="order-card-footer">
        <div class="footer-row">
            <p class="order-card-details">${order.quantity} Tờ / ${
    order.unit
  } Bộ</p>
            <p class="order-card-date">Giao: <b>${deliveryDate}</b></p>
        </div>
        ${
          completedAt
            ? `<div class="footer-row"><p class="order-card-date completed-time">Xong: ${completedAt}</p></div>`
            : ""
        }
      </div>
    </div>
  `;
  
  card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(order);
  });
  
  const completeBtn = card.querySelector('.complete-btn') as HTMLButtonElement;
  if (order.status === 'inProduction') {
    completeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateOrderStatus(order.id, 'completed');
    });
  } else {
    completeBtn.style.display = 'none';
  }

  card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteOrder(order);
  });

  const copyBtn = card.querySelector('.copy-image-btn') as HTMLButtonElement;
  if (copyBtn && order.image_url) {
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCopyImage(order.image_url, copyBtn);
    });
  }

  return card;
}

/**
 * Fetches orders from Supabase and renders them.
 */
async function fetchAndRenderOrders() {
  dom.globalError.hidden = true;
  // Show loaders in each column
  Object.values(dom.columns).forEach(col => {
      col.innerHTML = '<div class="loader"></div>';
  });

  try {
    const { data, error } = await supabase.from('orders').select('*');
    if (error) throw error;
    state.orders = data || [];
    renderOrders(); // This will clear loaders and render cards
  } catch (error) {
    console.error("Error fetching orders:", error);
    // Clear loaders on error
    Object.values(dom.columns).forEach(col => { col.innerHTML = ''; });
    dom.globalError.textContent = 'Không thể tải dữ liệu đơn hàng. Vui lòng kiểm tra kết nối mạng và làm mới trang.';
    dom.globalError.hidden = false;
  }
}

/**
 * Renders orders from the state to the correct columns, applying filters and sorting.
 */
function renderOrders() {
    // Clear columns before rendering
    Object.values(dom.columns).forEach(col => { col.innerHTML = ''; });

    const searchTerm = dom.searchInput.value.toLowerCase();
  
    const filteredOrders = state.orders.filter(order => 
        order.name.toLowerCase().includes(searchTerm) || 
        (order.factory && order.factory.toLowerCase().includes(searchTerm))
    );
  
    // Calculate priority for urgent orders that are not yet completed
    const urgentSortedForPriority = [...filteredOrders]
      .filter(order => order.is_urgent && order.status !== 'completed')
      .sort((a, b) => {
        const aDate = a.delivery_date ? new Date(a.delivery_date).getTime() : Infinity;
        const bDate = b.delivery_date ? new Date(b.delivery_date).getTime() : Infinity;
        
        if (aDate !== bDate) {
            return aDate - bDate;
        }
        
        // Fallback to creation date for stable sorting
        const aCreation = new Date(a.created_at).getTime();
        const bCreation = new Date(b.created_at).getTime();
        return aCreation - bCreation;
      });
    
    const priorityMap = new Map<string|number, number>();
    urgentSortedForPriority.forEach((order, index) => {
        priorityMap.set(order.id, index + 1);
    });

    // Group orders by status
    const groupedOrders: { [key: string]: any[] } = {
        inProduction: [],
        waiting: [],
        completed: [],
    };
    filteredOrders.forEach(order => {
        if (groupedOrders[order.status]) {
            groupedOrders[order.status].push(order);
        }
    });

    // Sort and render each column
    for (const status in groupedOrders) {
        const columnOrders = groupedOrders[status];
        const { key, direction } = state.sortConfig[status];
        const modifier = direction === 'asc' ? 1 : -1;
        
        columnOrders.sort((a, b) => {
            let valA, valB;

            switch (key) {
                case 'priority':
                    valA = priorityMap.get(a.id) ?? Infinity;
                    valB = priorityMap.get(b.id) ?? Infinity;
                    break;
                case 'factory':
                    valA = a.factory?.toLowerCase() || ''
                    valB = b.factory?.toLowerCase() || '';
                    return valA.localeCompare(valB) * modifier;
                case 'quantity':
                    valA = a.quantity || 0;
                    valB = b.quantity || 0;
                    break;
                case 'deliveryDate':
                    // Put orders with no date at the end
                    valA = a.delivery_date ? new Date(a.delivery_date).getTime() : Infinity;
                    valB = b.delivery_date ? new Date(b.delivery_date).getTime() : Infinity;
                    break;
                 case 'createdAt':
                    valA = new Date(a.created_at).getTime();
                    valB = new Date(b.created_at).getTime();
                    break;
                case 'completedAt':
                    valA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
                    valB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
                    break;
                default:
                    return 0;
            }
            
            if (valA < valB) return -1 * modifier;
            if (valA > valB) return 1 * modifier;
            return 0;
        });

        const columnEl = dom.columns[status as keyof typeof dom.columns];
        columnOrders.forEach(order => {
            const priority = priorityMap.get(order.id);
            const card = createOrderCard(order, priority);
            columnEl.appendChild(card);
        });
    }
    updateActiveSortButtons();
}

/**
 * Updates the visual state of sort buttons to show the active sort.
 */
function updateActiveSortButtons() {
    document.querySelectorAll('.sort-options button').forEach(btn => {
        btn.classList.remove('active');
    });

    for (const status in state.sortConfig) {
        const { key } = state.sortConfig[status];
        if (key) {
            const activeBtn = document.querySelector(`.kanban-column[data-status="${status}"] .sort-options button[data-sort="${key}"]`);
            activeBtn?.classList.add('active');
        }
    }
}


/**
 * Opens the order modal in 'edit' mode and populates it with order data.
 * @param {any} order The order object to edit.
 */
function openEditModal(order: any) {
    state.editingOrderId = order.id;
    const form = dom.orderForm;

    (form.elements.namedItem('order-name') as HTMLInputElement).value = order.name;
    (form.elements.namedItem('order-factory') as HTMLSelectElement).value = order.factory;
    (form.elements.namedItem('order-quantity') as HTMLInputElement).value = order.quantity;
    (form.elements.namedItem('order-unit') as HTMLInputElement).value = order.unit;
    (form.elements.namedItem('order-delivery-date') as HTMLInputElement).value = order.delivery_date || '';

    const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
    const uploadPlaceholder = document.getElementById('upload-placeholder') as HTMLElement;
    if (order.image_url) {
        imagePreview.src = order.image_url;
        imagePreview.hidden = false;
        uploadPlaceholder.hidden = true;
    } else {
        imagePreview.src = '#';
        imagePreview.hidden = true;
        uploadPlaceholder.hidden = false;
    }
    (form.elements.namedItem('order-image') as HTMLInputElement).value = '';

    (document.getElementById('modal-title') as HTMLElement).textContent = 'Sửa đơn hàng';
    (document.getElementById('submit-order-btn') as HTMLElement).textContent = 'Cập nhật đơn hàng';

    dom.orderModal.classList.add('is-visible');
}

// --- API Helper Functions (Refactored based on user's guide) ---

/**
 * Ensures a valid user session exists, otherwise throws an error.
 */
async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new Error('Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!');
  }
  return data.session;
}


/**
 * Converts, uploads an image file to Supabase Storage, and returns its public URL.
 * Also handles deletion of a previous image if provided.
 * @param {File} file The new image file to upload.
 * @param {string} userId The ID of the user uploading the file.
 * @param {string | null} [oldImageUrl] The URL of an old image to delete.
 * @returns {Promise<string>} The public URL of the uploaded image.
 */
async function uploadOrderImage(file: File, userId: string, oldImageUrl: string | null = null): Promise<string> {
    // If there's an old image, attempt to delete it first.
    if (oldImageUrl) {
        const oldPath = storagePathFromUrl(oldImageUrl, BUCKET_NAME);
        if (oldPath) {
            // Non-blocking deletion, fire and forget. Log errors if they occur.
            supabase.storage.from(BUCKET_NAME).remove([oldPath]).then(({ error }) => {
                if (error && (error as any).statusCode !== '404') {
                    console.warn("Could not delete old image during update:", error);
                }
            });
        }
    }

    // Convert the image to WebP before uploading for optimization.
    console.log(`Original file: ${file.name}, size: ${Math.round(file.size / 1024)} KB`);
    const webpBlob = await convertImageToWebP(file, { quality: 0.8 });
    const originalName = file.name.substring(0, file.name.lastIndexOf('.'));
    const webpFileName = `${originalName}.webp`;
    const webpFile = new File([webpBlob], webpFileName, { type: 'image/webp' });
    console.log(`Converted file: ${webpFile.name}, size: ${Math.round(webpFile.size / 1024)} KB`);

    // Standardize file path with user ID to comply with Storage RLS policies.
    const filePath = `${userId}/${Date.now()}-${webpFile.name}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(filePath, webpFile);
    if (uploadError) {
        // Re-throw with a more user-friendly message
        throw new Error(`Lỗi tải ảnh lên: ${uploadError.message}`);
    }
    
    // Get the public URL for the newly uploaded file.
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return data.publicUrl;
}

/**
 * Calls the Edge Function to trigger a push notification for a new order.
 * This function catches its own errors to avoid blocking the main UI flow.
 * @param {number | string} orderId The ID of the newly created order.
 * @param {string} title The title for the push notification.
 * @param {string} body The body content for the push notification.
 */
async function notifyNewOrder(orderId: number | string, title: string, body: string) {
    try {
        const { error } = await supabase.functions.invoke(
            'send-order-notification',
            { body: { order_id: orderId, title, body } }
        );
        if (error) throw error;
    } catch (e) {
        // Log as a warning, as this is a non-critical background task.
        console.warn('Notification trigger failed (non-critical):', e);
    }
}

/**
 * Handles form submission for adding or editing an order, orchestrating API calls.
 * @param e The form submission event.
 */
async function handleOrderFormSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const submitBtn = document.getElementById('submit-order-btn') as HTMLButtonElement;
    const isEditing = !!state.editingOrderId;

    submitBtn.disabled = true;
    submitBtn.textContent = isEditing ? 'Đang cập nhật...' : 'Đang xử lý...';
    
    let uploadedImageUrl: string | null = null;

    try {
        // 1. Authenticate and get user ID
        const session = await requireSession();
        const userId = session.user.id;
        
        // 2. Gather form data
        const name = (form.elements.namedItem('order-name') as HTMLInputElement).value;
        const factory = (form.elements.namedItem('order-factory') as HTMLSelectElement).value;
        const quantity = (form.elements.namedItem('order-quantity') as HTMLInputElement).value;
        const unit = (form.elements.namedItem('order-unit') as HTMLInputElement).value;
        const deliveryDate = (form.elements.namedItem('order-delivery-date') as HTMLInputElement).value;
        const imageFile = (form.elements.namedItem('order-image') as HTMLInputElement).files?.[0];

        // 3. Handle image upload (if a new file is provided)
        let imageUrl: string | null = null;
        const existingOrder = isEditing ? state.orders.find(o => o.id === state.editingOrderId) : null;

        if (imageFile) {
            uploadedImageUrl = await uploadOrderImage(imageFile, userId, existingOrder?.image_url);
            imageUrl = uploadedImageUrl;
        } else if (isEditing) {
            // Keep the old image if no new one is uploaded
            imageUrl = existingOrder?.image_url || null;
        }

        // 4. Prepare and submit order data to the database
        const orderData = {
            name,
            factory,
            quantity: parseInt(quantity, 10) || 0,
            unit: parseInt(unit, 10) || 0,
            delivery_date: deliveryDate || null,
            image_url: imageUrl,
        };

        if (isEditing) {
            const { error } = await supabase
                .from('orders')
                .update(orderData)
                .eq('id', state.editingOrderId);
            if (error) throw error;
            // The realtime subscription will handle the UI update.
        } else {
            const finalData = { ...orderData, user_id: userId, status: 'waiting', is_urgent: false };
            const { data: newOrder, error } = await supabase
              .from('orders')
              .insert([finalData])
              .select('id, name, factory') // Get data back for notification
              .single();

            if (error) throw error;
            
            // 5. (On success) Trigger notification for the new order
            if (newOrder) {
                const title = 'Có đơn hàng mới!';
                const body = `Đơn hàng: "${newOrder.name}" cho nhà máy ${newOrder.factory}.`;
                notifyNewOrder(newOrder.id, title, body);
            }
        }

        // 6. UI Success
        dom.orderModal.classList.remove('is-visible');

    } catch (error: any) {
        console.error("Error submitting order:", error);
        
        // Cleanup: If an image was uploaded but the DB operation failed, delete it.
        if (uploadedImageUrl) {
            const pathToDelete = storagePathFromUrl(uploadedImageUrl, BUCKET_NAME);
            if (pathToDelete) {
                console.log(`Database operation failed. Attempting to delete orphaned image: ${pathToDelete}`);
                supabase.storage.from(BUCKET_NAME).remove([pathToDelete]).then(({ error: deleteError }) => {
                    if (deleteError) {
                        console.error("Cleanup failed: Could not delete orphaned image.", deleteError.message);
                    } else {
                        console.log("Orphaned image successfully deleted.");
                    }
                });
            }
        }
        
        // Display a user-friendly error message
        alert(error?.message ?? 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.');

    } finally {
        // ALWAYS reset UI state
        submitBtn.disabled = false;
        submitBtn.textContent = isEditing ? 'Cập nhật đơn hàng' : 'Thêm đơn hàng';
        state.editingOrderId = null;
        form.reset();
        (document.getElementById('image-preview') as HTMLImageElement).hidden = true;
        (document.getElementById('upload-placeholder') as HTMLElement).hidden = false;
    }
}

/**
 * Handles initiating the deletion of an order by showing a confirmation modal.
 * This function now ensures that the associated image is also deleted.
 * @param {any} order The full order object to delete.
 */
function handleDeleteOrder(order: any) {
    const confirmationMessage = `Bạn có chắc chắn muốn xóa đơn hàng "${order.name}"? Thao tác này không thể hoàn tác.`;

    showConfirmModal(confirmationMessage, async () => {
        const originalOrders = [...state.orders];
        // Optimistic UI update
        state.orders = state.orders.filter(o => o.id !== order.id);
        renderOrders();

        try {
            // Step 1: Get the storage path for the image.
            let path: string | null = null;
            if (order.image_url) {
                path = storagePathFromUrl(order.image_url, BUCKET_NAME);
            }

            // Step 2: If a path exists, attempt to delete the image from storage.
            if (path) {
                const { error: storageError } = await supabase.storage
                    .from(BUCKET_NAME)
                    .remove([path]);

                if (storageError) {
                    console.error('Storage delete error:', storageError);
                    const supabaseError = storageError as any;
                    // Treat 404 (Not Found) as a success, as the file is already gone.
                    if (supabaseError.statusCode !== '404') {
                        // For any other error (like 403 Forbidden), throw to rollback the UI.
                        if (supabaseError.statusCode === '403' || supabaseError.statusCode === '401') {
                            throw new Error(`Bị chặn bởi quyền (RLS): ${storageError.message}. File có thể không thuộc sở hữu của bạn.`);
                        }
                        throw storageError;
                    }
                }
            }

            // Step 3: Delete the order record from the database.
            const { error: dbError } = await supabase.from('orders').delete().eq('id', order.id);
            if (dbError) {
                throw dbError;
            }

        } catch (error: any) {
            console.error("Error deleting order:", error);
            alert(`Không thể xóa đơn hàng: ${error?.message ?? "Lỗi không xác định."}`);
            // Revert the optimistic UI update on any failure.
            state.orders = originalOrders;
            renderOrders();
        }
    });
}


/**
 * Updates an order's status in Supabase.
 * @param orderId The ID of the order to update.
 * @param newStatus The new status.
 */
async function updateOrderStatus(orderId: string | number, newStatus: string) {
    const order = state.orders.find(o => o.id == orderId);
    if (!order || order.status === newStatus) return;

    const originalStatus = order.status;
    order.status = newStatus;
     if (newStatus === 'completed' && !order.completed_at) {
        order.completed_at = new Date().toISOString();
    } else if (newStatus !== 'completed') {
        order.completed_at = null;
    }
    renderOrders();

    try {
        const { error } = await supabase
            .from('orders')
            .update({ status: newStatus, completed_at: order.completed_at })
            .eq('id', orderId);
        if (error) throw error;
    } catch (error) {
        console.error("Error updating order status:", error);
        order.status = originalStatus; // Revert on error
        renderOrders();
    }
}

/**
 * Toggles the urgency status of an order.
 * @param order The order object to update.
 */
async function handleToggleUrgency(order: any) {
    const originalIsUrgent = order.is_urgent;
    const newUrgentState = !originalIsUrgent;

    // Optimistic UI update
    const orderInState = state.orders.find(o => o.id === order.id);
    if (orderInState) {
        orderInState.is_urgent = newUrgentState;
    }
    renderOrders();

    try {
        const { error } = await supabase
            .from('orders')
            .update({ is_urgent: newUrgentState })
            .eq('id', order.id);

        if (error) {
            // Revert on error
            console.error("Error updating urgency:", error);
            if (orderInState) {
                orderInState.is_urgent = originalIsUrgent;
            }
            renderOrders();
            alert('Không thể cập nhật độ ưu tiên. Vui lòng thử lại.');
        }
    } catch (error) {
        console.error("Unexpected error updating urgency:", error);
        if (orderInState) {
            orderInState.is_urgent = originalIsUrgent;
        }
        renderOrders();
        alert('Đã xảy ra lỗi không mong muốn khi cập nhật độ ưu tiên.');
    }
}

/**
 * Toggles the 'actively producing' state for an order in the 'inProduction' column.
 * This is a UI-only state to show which order is being worked on right now.
 * @param {string | number} orderId The ID of the order to toggle.
 */
function handleToggleActivelyProducing(orderId: string | number) {
    if (state.activelyProducing.has(orderId)) {
        state.activelyProducing.delete(orderId);
    } else {
        state.activelyProducing.add(orderId);
    }
    renderOrders(); // Re-render to reflect text and style changes
}


/**
 * Subscribes to real-time changes in the orders table and updates the UI.
 */
function subscribeToOrderChanges() {
    const channel = supabase
        .channel('orders-realtime-channel')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'orders' },
            (payload) => {
                console.log('New order received:', payload.new);
                // Show in-app notification as a fallback.
                // The main notification is handled by the service worker via push.
                showNotification(`Đã thêm đơn hàng mới: "${payload.new.name}"`);
                
                // Avoid duplicates if the client just inserted it and UI is already updated
                if (!state.orders.some(o => o.id === payload.new.id)) {
                    state.orders.push(payload.new);
                    renderOrders();
                }
            }
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'orders' },
            (payload) => {
                console.log('Order updated:', payload.new);
                const index = state.orders.findIndex(o => o.id === payload.new.id);
                if (index !== -1) {
                    state.orders[index] = payload.new;
                    renderOrders();
                }
            }
        )
        .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'orders' },
            (payload) => {
                console.log('Order deleted:', payload.old);
                // The id is the only guaranteed part of the 'old' record payload
                state.orders = state.orders.filter(o => o.id !== payload.old.id);
                renderOrders();
            }
        )
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to real-time order updates!');
                dom.connectionStatus.className = 'connection-status-indicator status-connected';
                dom.connectionStatusText.textContent = 'Đã kết nối';
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('Realtime subscription failed:', err);
                dom.connectionStatus.className = 'connection-status-indicator status-error';
                dom.connectionStatusText.textContent = 'Lỗi kết nối';
                dom.globalError.textContent = 'Mất kết nối thời gian thực. Dữ liệu có thể không được cập nhật tự động.';
                dom.globalError.hidden = false;
            }
        });

    return channel;
}


/**
 * Sets the UI based on the user's authentication state.
 * @param {boolean} isAuthenticated - Whether the user is logged in.
 */
async function updateUIForAuthState(isAuthenticated: boolean) {
  dom.body.classList.toggle('role-authenticated', isAuthenticated);
  dom.body.classList.toggle('role-public', !isAuthenticated);
  
  dom.loginBtn.hidden = isAuthenticated;
  dom.logoutBtn.hidden = !isAuthenticated;
  dom.userDisplay.hidden = !isAuthenticated;
  dom.enableNotificationsBtn.hidden = !isAuthenticated;

  if (isAuthenticated) {
      const { data: { user } } = await supabase.auth.getUser();
      dom.userEmail.textContent = user?.email || 'N/A';
      initPushNotifications();
  } else {
      dom.userEmail.textContent = '';
  }
}

/**
 * Initializes the application.
 */
async function initApp() {
  dom.connectionStatusText.textContent = 'Đang kết nối...';
  // Initial fetch for public view. If user is logged in, data will be refreshed.
  fetchAndRenderOrders();
  
  const { data: { session } } = await supabase.auth.getSession();
  await updateUIForAuthState(!!session);

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state changed:', event, !!session);
    await updateUIForAuthState(!!session);
    // Re-fetch orders on auth change to ensure correct data/policies are applied
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchAndRenderOrders();
    }
  });

  subscribeToOrderChanges();
  initEventListeners();
}

/**
 * Sets up all event listeners for the application.
 */
function initEventListeners() {
  dom.loginBtn.addEventListener("click", () => dom.loginModal.classList.add("is-visible"));
  dom.closeLoginModalBtn.addEventListener("click", () => dom.loginModal.classList.remove("is-visible"));
  dom.logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  dom.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const loginError = document.getElementById('login-error') as HTMLElement;
    const submitBtn = (e.currentTarget as HTMLFormElement).querySelector('button[type="submit"]') as HTMLButtonElement;
    
    loginError.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang đăng nhập...';
    
    const email = (dom.loginForm.elements.namedItem('email-input') as HTMLInputElement).value;
    const password = (dom.loginForm.elements.namedItem('password-input') as HTMLInputElement).value;
    
    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            if (error.message.toLowerCase().includes('failed to fetch') || error.message.toLowerCase().includes('network')) {
                 loginError.textContent = 'Lỗi kết nối mạng. Vui lòng thử lại.';
            } else if (error.message === 'Invalid login credentials') {
                 loginError.textContent = 'Email hoặc mật khẩu không đúng.';
            } else {
                 loginError.textContent = `Đã xảy ra lỗi: ${error.message}`;
            }
            loginError.hidden = false;
        } else {
            dom.loginModal.classList.remove("is-visible");
            dom.loginForm.reset();
        }
    } catch (err: any) {
        console.error("Unexpected login error:", err);
        loginError.textContent = 'Đã xảy ra lỗi không mong muốn.';
        loginError.hidden = false;
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Đăng nhập';
    }
  });
  
  dom.searchInput.addEventListener('input', renderOrders);
  
  dom.addOrderBtn.addEventListener('click', () => {
      state.editingOrderId = null;
      dom.orderForm.reset();
      (document.getElementById('image-preview') as HTMLImageElement).hidden = true;
      (document.getElementById('upload-placeholder') as HTMLElement).hidden = false;
      (document.getElementById('modal-title') as HTMLElement).textContent = 'Thêm đơn hàng mới';
      (document.getElementById('submit-order-btn') as HTMLElement).textContent = 'Thêm đơn hàng';
      dom.orderModal.classList.add('is-visible');
  });
  dom.closeOrderModalBtn.addEventListener("click", () => dom.orderModal.classList.remove("is-visible"));
  dom.closeReviewModalBtn.addEventListener("click", () => dom.reviewModal.classList.remove("is-visible"));


  dom.orderForm.addEventListener('submit', handleOrderFormSubmit);
  
  (document.getElementById('order-image') as HTMLInputElement).addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
      const uploadPlaceholder = document.getElementById('upload-placeholder') as HTMLElement;
      if (file) {
          imagePreview.src = URL.createObjectURL(file);
          imagePreview.hidden = false;
          uploadPlaceholder.hidden = true;
      } else {
          imagePreview.hidden = true;
          uploadPlaceholder.hidden = false;
      }
  });
  
  // --- Drag and Drop for Image Upload ---
  const uploadLabel = dom.orderForm.querySelector('.upload-label') as HTMLElement;
  const fileInput = dom.orderForm.querySelector('#order-image') as HTMLInputElement;

  if (uploadLabel && fileInput) {
    // Prevent default behaviors for the entire window to stop the browser from opening the dropped file.
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    // Highlight drop zone
    ['dragenter', 'dragover'].forEach(eventName => {
      uploadLabel.addEventListener(eventName, () => {
        uploadLabel.classList.add('drag-active');
      }, false);
    });

    // Un-highlight drop zone
    ['dragleave', 'drop'].forEach(eventName => {
      uploadLabel.addEventListener(eventName, () => {
        uploadLabel.classList.remove('drag-active');
      }, false);
    });
    
    // Handle drop
    uploadLabel.addEventListener('drop', (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (dt?.files && dt.files.length > 0) {
        // Assign the files to the file input
        fileInput.files = dt.files;
        // Manually trigger a 'change' event to update the preview
        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
      }
    }, false);
  }

  // Custom Confirm Modal Listeners
  dom.confirmModalCancelBtn.addEventListener('click', hideConfirmModal);
  dom.confirmModalConfirmBtn.addEventListener('click', () => {
    if (typeof state.confirmAction === 'function') {
        state.confirmAction();
    }
    hideConfirmModal();
  });
  
  // Sorting controls
  document.querySelectorAll('.sort-container').forEach(container => {
    const sortBtn = container.querySelector('.sort-btn');
    const options = container.querySelector('.sort-options');
    if (sortBtn && options) {
      sortBtn.addEventListener('click', () => {
        options.classList.toggle('is-visible');
      });
    }

    container.querySelectorAll<HTMLButtonElement>('.sort-options button').forEach(optionBtn => {
      optionBtn.addEventListener('click', () => {
        // FIX: Use typed query selectors to avoid casting Element to HTMLElement.
        const columnEl = container.closest<HTMLElement>('.kanban-column');
        if (!columnEl) return;

        const status = columnEl.dataset.status!;
        const sortKey = optionBtn.dataset.sort!;
        const currentSort = state.sortConfig[status];

        let newDirection = 'asc';
        if (currentSort && currentSort.key === sortKey) {
            newDirection = currentSort.direction === 'asc' ? 'desc' : 'asc';
        }

        state.sortConfig[status] = { key: sortKey, direction: newDirection };
        renderOrders();
      });
    });
  });


  // --- Event Listeners for Drag and Drop ---
  const board = document.querySelector('.kanban-board') as HTMLElement;
  const header = document.querySelector('header');
  const DRAG_UP_TARGET_Y = 150; // Pixels from top of viewport to trigger drop zone

  // 1. Mouse-based Drag and Drop (for Desktop)
  document.querySelectorAll('.kanban-column').forEach(column => {
      // FIX: The event parameter `e` should be typed as DragEvent to access its properties correctly.
      column.addEventListener('dragstart', (e: DragEvent) => {
          const card = (e.target as HTMLElement).closest('.order-card');
          if (card) {
              state.draggedCard = card as HTMLElement;
              setTimeout(() => card.classList.add('dragging'), 0);
          }
      });

      // FIX: The event parameter `e` should be typed as DragEvent to access properties like `clientY`.
      column.addEventListener('dragend', (e: DragEvent) => {
          if (state.draggedCard) {
              const card = state.draggedCard;
              const orderId = card.dataset.id;
              const originalStatus = card.dataset.status;

              // Check if a 'drop' event on another column already updated the status
              const currentOrderInState = orderId ? state.orders.find(o => o.id == orderId) : null;

              // "Drag up to production" shortcut logic
              if (
                  originalStatus === 'waiting' &&
                  orderId &&
                  e.clientY < DRAG_UP_TARGET_Y &&
                  currentOrderInState &&
                  currentOrderInState.status === 'waiting' // Prevents double-update
              ) {
                  updateOrderStatus(orderId, 'inProduction');
              }
              
              card.classList.remove('dragging');
              state.draggedCard = null;
          }
          document.querySelectorAll('.kanban-column.drag-over').forEach(c => c.classList.remove('drag-over'));
          header?.classList.remove('drop-target-active'); // Cleanup visual cue
      });

      // FIX: The event parameter `e` should be typed as DragEvent.
      column.addEventListener('dragover', (e: DragEvent) => {
          e.preventDefault();
          if (!column.classList.contains('drag-over')) {
              column.classList.add('drag-over');
          }
      });

      // FIX: The event parameter `e` should be typed as DragEvent.
      column.addEventListener('dragleave', (e: DragEvent) => {
          column.classList.remove('drag-over');
      });

      // FIX: The event parameter `e` should be typed as DragEvent.
      column.addEventListener('drop', (e: DragEvent) => {
          e.preventDefault();
          column.classList.remove('drag-over');
          const targetColumn = e.currentTarget as HTMLElement;
          if (state.draggedCard && targetColumn) {
              const newStatus = targetColumn.dataset.status;
              const orderId = state.draggedCard.dataset.id;
              const oldStatus = state.draggedCard.dataset.status;
              if (newStatus && orderId && newStatus !== oldStatus) {
                  updateOrderStatus(orderId, newStatus);
              }
          }
      });
  });

  // Add a listener to the board to show the visual cue for the "drag up" shortcut
  // FIX: The event parameter `e` should be typed as DragEvent to access properties like `clientY`.
  board.addEventListener('dragover', (e: DragEvent) => {
      if (header && state.draggedCard?.dataset.status === 'waiting' && e.clientY < DRAG_UP_TARGET_Y) {
          header.classList.add('drop-target-active');
      } else if (header) {
          header.classList.remove('drop-target-active');
      }
  });
  
  // --- Delegated Card Interaction Listeners ---
  // Double-click to toggle 'actively producing' status
  board.addEventListener('dblclick', (e) => {
    if (!document.body.classList.contains('role-authenticated')) return;
    const card = (e.target as HTMLElement).closest('.order-card');
    // Only toggle for cards that are 'inProduction'
    if (card instanceof HTMLElement && card.dataset.status === 'inProduction') {
      const orderId = card.dataset.id;
      if (orderId) {
        // Convert the string from dataset to a number before toggling state
        handleToggleActivelyProducing(parseInt(orderId, 10));
      }
    }
  });

  // Right-click (context menu) to toggle 'urgent' status
  board.addEventListener('contextmenu', (e) => {
    if (!document.body.classList.contains('role-authenticated')) return;
    const card = (e.target as HTMLElement).closest('.order-card');
    // FIX: Add type guard to ensure card is an HTMLElement before accessing dataset
    if (card instanceof HTMLElement) {
      e.preventDefault(); // Prevent the default browser context menu
      const orderId = card.dataset.id;
      if (orderId) {
        const order = state.orders.find(o => o.id == orderId);
        if (order) {
          handleToggleUrgency(order);
        }
      }
    }
  });
}


// --- Helper Functions ---

/**
 * Copies an image from a URL to the clipboard using the Canvas method to avoid CORS issues.
 * @param {string} imageUrl The URL of the image to copy.
 * @param {HTMLButtonElement} buttonEl The button element that was clicked.
 */
async function handleCopyImage(imageUrl: string, buttonEl: HTMLButtonElement) {
    if (!navigator.clipboard?.write) {
        console.error('Clipboard API not supported.');
        showNotification('Trình duyệt của bạn không hỗ trợ sao chép hình ảnh.', 'error');
        return;
    }

    const originalContent = buttonEl.innerHTML;
    buttonEl.disabled = true;

    try {
        // Create an image element to load the cross-origin image
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Crucial for enabling CORS on the image request
        img.src = imageUrl;

        // Wait for the image to load
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = (err) => reject(new Error(`Could not load image. It might be a CORS issue. Error: ${JSON.stringify(err)}`));
        });

        // Draw the loaded image onto an off-screen canvas
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        // FIX: The canvas context should be '2d' to access the drawImage method.
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get canvas context.');
        }
        ctx.drawImage(img, 0, 0);

        // Get the image data from the canvas as a Blob
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/png'); // Using PNG for best clipboard compatibility
        });

        if (!blob) {
            throw new Error('Failed to convert canvas to blob.');
        }

        // Write the blob to the clipboard
        const clipboardItem = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([clipboardItem]);

        showNotification('Đã sao chép hình ảnh!', 'success');
        buttonEl.classList.add('success');
        buttonEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>`;

    } catch (error) {
        console.error('Failed to copy image:', error);
        showNotification('Không thể sao chép hình ảnh.', 'error');
        buttonEl.innerHTML = originalContent; // Revert to original icon on error
    } finally {
        if (buttonEl.classList.contains('success')) {
             setTimeout(() => {
                buttonEl.innerHTML = originalContent;
                buttonEl.disabled = false;
                buttonEl.classList.remove('success');
            }, 2000);
        } else {
             buttonEl.disabled = false; // Re-enable immediately on error
        }
    }
}


/**
 * Displays a short-lived notification message at the top of the screen.
 * @param {string} message The text to display.
 * @param {'success' | 'error'} type The type of notification for styling.
 * @param {number} duration How long the notification stays, in milliseconds.
 */
function showNotification(message: string, type: 'success' | 'error' = 'success', duration = 4000) {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('hiding');
        // Remove the element from the DOM after the animation completes
        notification.addEventListener('animationend', () => {
            notification.remove();
        });
    }, duration);
}

/**
 * Converts an image file to WebP format using the Canvas API.
 * @param {File} file The original image file.
 * @param {object} options Options for conversion.
 * @param {number} options.quality The quality of the output WebP image (0 to 1).
 * @returns {Promise<Blob>} A promise that resolves with the WebP image as a Blob.
 */
function convertImageToWebP(file: File, options: { quality: number }): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context.'));
                }
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Canvas to Blob conversion failed.'));
                        }
                    },
                    'image/webp',
                    options.quality
                );
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}


/**
 * A robust function to extract the storage object path from various Supabase URL formats.
 * Handles public URLs, signed URLs, and render URLs.
 * @param {string} url The full Supabase storage URL.
 * @param {string} bucket The name of the storage bucket.
 * @returns {string | null} The decoded storage path or null if parsing fails.
 */
function storagePathFromUrl(url: string, bucket: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    // Find the bucket name in the path parts. It's the segment before the actual file path begins.
    const bucketIndex = parts.findIndex(p => p === bucket);
    
    if (bucketIndex === -1 || bucketIndex === parts.length - 1) {
        console.warn(`Bucket "${bucket}" not found in URL path:`, url);
        return null;
    }
    
    // Join the remaining parts to form the path and decode URI components like %20 or other special characters.
    const path = parts.slice(bucketIndex + 1).join('/');
    return decodeURIComponent(path);
  } catch (error){
    console.error("Failed to parse URL for storage path:", url, error);
    return null;
  }
}

/**
 * Opens the review modal and fetches reviews for a given order.
 * @param {any} order The order to show reviews for.
 */
async function openReviewModal(order: any) {
    state.reviewingOrderId = order.id;
    (document.getElementById('review-modal-title') as HTMLElement).textContent = `Review cho: ${order.name}`;
    dom.reviewModal.classList.add('is-visible');
    await fetchAndRenderReviews(order.id);
}

/**
 * Fetches and displays reviews for a specific order.
 * @param {string|number} orderId The ID of the order.
 */
async function fetchAndRenderReviews(orderId: string | number) {
    const reviewList = document.getElementById('review-list') as HTMLElement;
    reviewList.innerHTML = '<div class="loader"></div>';

    try {
        const { data, error } = await supabase
            .from('reviews')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (data.length === 0) {
            reviewList.innerHTML = '<p>Chưa có review nào cho đơn hàng này.</p>';
            return;
        }

        reviewList.innerHTML = ''; // Clear loader or previous content
        data.forEach(review => {
            const reviewEl = document.createElement('div');
            reviewEl.className = 'review-item';
            const reviewDate = new Date(review.created_at).toLocaleString('vi-VN');
            reviewEl.innerHTML = `
                <p>${review.content}</p>
                <div class="review-item-date">${reviewDate}</div>
            `;
            reviewList.appendChild(reviewEl);
        });
    } catch (error) {
        console.error("Error fetching reviews:", error);
        reviewList.innerHTML = '<p class="error">Không thể tải review.</p>';
    }
}

/**
 * Handles the submission of the review form.
 * @param {Event} e The form submission event.
 */
async function handleReviewFormSubmit(e: Event) {
    e.preventDefault();
    if (!state.reviewingOrderId) return;

    const form = e.target as HTMLFormElement;
    const contentInput = form.elements.namedItem('review-content') as HTMLTextAreaElement;
    const content = contentInput.value.trim();
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    if (!content) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang gửi...';

    try {
        const { error } = await supabase
            .from('reviews')
            .insert([{ content: content, order_id: state.reviewingOrderId }]);
        
        if (error) throw error;
        
        contentInput.value = ''; // Clear input
        await fetchAndRenderReviews(state.reviewingOrderId); // Refresh list

    } catch (error) {
        console.error("Error submitting review:", error);
        alert('Không thể gửi review. Vui lòng thử lại.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gửi Review';
    }
}

/**
 * Shows the custom confirmation modal.
 * @param {string} message The message to display in the modal.
 * @param {() => void} onConfirm The callback function to execute if the user confirms.
 */
function showConfirmModal(message: string, onConfirm: () => void) {
    const messageEl = document.getElementById('confirm-modal-message') as HTMLElement;
    messageEl.textContent = message;
    state.confirmAction = onConfirm;
    dom.confirmModal.classList.add('is-visible');
}

/**
 * Hides the custom confirmation modal.
 */
function hideConfirmModal() {
    dom.confirmModal.classList.remove('is-visible');
    state.confirmAction = null;
}


// --- Push Notification Functions ---

/**
 * Converts a VAPID public key string to a Uint8Array.
 */
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Registers the service worker and sets up the push notification UI.
 */
async function initPushNotifications() {
    // Only register the service worker if the browser supports it and we are on a production-like domain.
    // This prevents 404 errors in preview environments like ai.studio.
    if ('serviceWorker' in navigator && 'PushManager' in window && !location.hostname.includes('ai.studio')) {
        console.log('Service Worker and Push is supported');
        
        window.addEventListener('load', async () => {
            try {
                // Use an absolute path to ensure the SW is found at the root.
                const swReg = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered', swReg);
                
                // Show the notification button
                dom.enableNotificationsBtn.hidden = false;
                dom.enableNotificationsBtn.addEventListener('click', handleNotificationSubscription);

                // Set initial button state
                const subscription = await swReg.pushManager.getSubscription();
                if (subscription) {
                    console.log('User IS subscribed.');
                    updateNotificationButton(true);
                } else {
                    console.log('User is NOT subscribed.');
                    updateNotificationButton(false);
                }
            } catch (error) {
                console.error('Service Worker Registration Error', error);
                dom.enableNotificationsBtn.hidden = true; // Hide if SW fails
            }
        });
    } else {
        if (location.hostname.includes('ai.studio')) {
             console.log('Service Worker registration skipped on preview domain.');
        } else {
            console.warn('Push messaging or Service Worker is not supported');
        }
        dom.enableNotificationsBtn.hidden = true;
    }
}

/**
 * Handles the logic for subscribing or unsubscribing from push notifications.
 */
async function handleNotificationSubscription() {
    const swReg = await navigator.serviceWorker.ready;
    const subscription = await swReg.pushManager.getSubscription();

    if (subscription) {
        // User is already subscribed, so unsubscribe them
        await subscription.unsubscribe();
        console.log('User unsubscribed.');
        // TODO: Also remove the subscription from your Supabase table
        updateNotificationButton(false);
        showNotification('Đã tắt thông báo đẩy.', 'success');
    } else {
        // User is not subscribed, so subscribe them
        try {
            const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            const newSubscription = await swReg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            });
            console.log('User is subscribed:', newSubscription);
            
            // Send the new subscription to your Supabase backend
            await saveSubscriptionToSupabase(newSubscription);
            
            updateNotificationButton(true);
            showNotification('Đã bật thông báo đẩy thành công!', 'success');
        } catch (err) {
            console.error('Failed to subscribe the user: ', err);
             if (Notification.permission === 'denied') {
                showNotification('Bạn đã chặn quyền thông báo. Vui lòng cho phép trong cài đặt trình duyệt.', 'error');
            } else {
                showNotification('Không thể bật thông báo. Vui lòng thử lại.', 'error');
            }
            updateNotificationButton(false);
        }
    }
}

/**
 * Saves the push subscription object to a Supabase table.
 * @param {PushSubscription} subscription The subscription object from the browser.
 */
async function saveSubscriptionToSupabase(subscription: PushSubscription) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error("Cannot save subscription, user not logged in.");
        return;
    }
    
    // The subscription object contains all the necessary information
    const subscriptionData = JSON.parse(JSON.stringify(subscription));

    const { error } = await supabase.from('push_subscriptions').upsert({
        id: subscription.endpoint, // Use endpoint as a unique ID
        user_id: user.id,
        subscription_details: subscriptionData,
    }, { onConflict: 'id' });

    if (error) {
        console.error('Error saving subscription:', error);
    } else {
        console.log('Subscription saved successfully.');
    }
}


/**
 * Updates the UI of the notification button.
 * @param {boolean} isSubscribed - Whether the user is currently subscribed.
 */
function updateNotificationButton(isSubscribed: boolean) {
    if (Notification.permission === 'denied') {
        dom.enableNotificationsBtn.disabled = true;
        dom.enableNotificationsBtn.title = 'Bạn đã chặn quyền thông báo';
        return;
    }

    if (isSubscribed) {
        dom.enableNotificationsBtn.classList.add('active');
        dom.enableNotificationsBtn.title = 'Tắt thông báo đẩy';
    } else {
        dom.enableNotificationsBtn.classList.remove('active');
        dom.enableNotificationsBtn.title = 'Bật thông báo đẩy';
    }
    dom.enableNotificationsBtn.disabled = false;
}


// --- START THE APP ---
document.addEventListener("DOMContentLoaded", initApp);