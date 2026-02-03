const socket = io();
let myRoomId = "";
let timerInterval;
let allCategories = {};
let currentCustomLocations = [];

function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerText = message;

  container.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.5s ease-out forwards';
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 3000);
}

function showConfirmation(message, onConfirm) {
  const modal = document.getElementById('confirmation-modal');
  const msgElem = document.getElementById('confirmation-message');
  const yesBtn = document.getElementById('confirm-yes');
  const noBtn = document.getElementById('confirm-no');

  msgElem.innerText = message;
  modal.classList.remove('hidden');

  yesBtn.onclick = () => {
    modal.classList.add('hidden');
    onConfirm();
  };

  noBtn.onclick = () => {
    modal.classList.add('hidden');
  };
}

socket.on("init_info", (data) => {
  allCategories = data.categories;
  renderCategoryToggles([]);
  renderLocationCheckboxes([]);

  // Auto-reconnect if session exists
  const savedRoomId = sessionStorage.getItem("spy_roomId");
  const savedName = sessionStorage.getItem("spy_name");
  if (savedRoomId && savedName) {
    // console.log("🔄 Otomatik bağlanılıyor:", savedRoomId, savedName);
    socket.emit("join_room", { roomId: savedRoomId, name: savedName });
    // We don't need to manually call showLobby here, join_success will handle it
  }
});

socket.on("error_message", (msg) => {
  showNotification(msg, 'error');
  // If auto-join failed (e.g. room closed), clear session
  if (sessionStorage.getItem("spy_roomId")) {
    sessionStorage.removeItem("spy_roomId");
    sessionStorage.removeItem("spy_name");
    showNotification("Oda bulunamadı veya kapandı, giriş ekranına dönüldü.", 'info');
    document.getElementById("loginSection").classList.remove("hidden");
    document.getElementById("lobbySection").classList.add("hidden");
  }
});

function createRoom() {
  const name = document.getElementById("createName").value.trim();
  if (!name) return showNotification("İsim gir", 'error');
  
  sessionStorage.setItem("spy_name", name); // Save name temporarily
  socket.emit("create_room", { name });
}

function joinRoom() {
  const name = document.getElementById("joinName").value.trim();
  let roomId = document.getElementById("joinRoomId").value.trim();
  if (!name || !roomId) return showNotification("İsim ve oda ID gir", 'error');

  roomId = roomId.toLowerCase();
  sessionStorage.setItem("spy_name", name);
  sessionStorage.setItem("spy_roomId", roomId);
  
  socket.emit("join_room", { roomId, name });
}

socket.on("join_success", ({ roomId }) => {
  myRoomId = roomId;
  sessionStorage.setItem("spy_roomId", roomId); // Ensure roomId is saved (especially for createRoom)
  showLobby(roomId);
});

function showLobby(roomId) {
  document.getElementById("loginSection").classList.add("hidden");
  document.getElementById("lobbySection").classList.remove("hidden");
  document.getElementById("roomTitle").innerText = "Oda: " + roomId;
}

let currentHostId = null;
let currentLocations = [];

socket.on("room_update", (data) => {
  currentHostId = data.hostId;
  currentLocations = data.locations;
  currentCustomLocations = data.customLocations || [];
  
  // Update Categories from server if available
  if (data.categories) {
    allCategories = data.categories;
  }
  
  // Update Players
  const pList = document.getElementById("playersList");
  pList.innerHTML = "";
  data.players.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.name + (p.id === data.hostId ? " 👑" : "");
    pList.appendChild(li);
  });

  // Update Locations List (View Only)
  const lList = document.getElementById("locationsList");
  lList.innerHTML = "";
  document.getElementById("locCount").innerText = data.locations.length;
  data.locations.forEach(loc => {
    const li = document.createElement("li");
    li.textContent = loc;
    // Mark custom locations
    if (currentCustomLocations.includes(loc)) {
      li.style.color = "#ffc107";
      li.textContent += " ⭐";
    }
    lList.appendChild(li);
  });

  // Host Controls
  const isHost = socket.id === data.hostId;
  const hostControls = document.getElementById("hostControls");
  if (isHost) {
    hostControls.classList.remove("hidden");
    renderCategoryToggles(data.locations);
    renderLocationCheckboxes(data.locations);
    renderCustomLocationsList();
  } else {
    hostControls.classList.add("hidden");
  }

  // Also update End Game Button visibility if game is running
  const endGameBtn = document.getElementById("endGameBtn");
  if (!document.getElementById("gameSection").classList.contains("hidden")) {
    if (isHost) {
      endGameBtn.classList.remove("hidden");
    } else {
      endGameBtn.classList.add("hidden");
    }
  }
});

// Render category toggles (enable/disable entire categories)
function renderCategoryToggles(activeLocations) {
  const container = document.getElementById("categoryToggles");
  container.innerHTML = "";
  
  for (const [categoryName, categoryItems] of Object.entries(allCategories)) {
    const div = document.createElement("div");
    div.className = "category-toggle-item";
    
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "cat_" + categoryName;
    checkbox.dataset.category = categoryName;
    
    // Check if all items in this category are active
    const activeCount = categoryItems.filter(item => activeLocations.includes(item)).length;
    checkbox.checked = activeCount === categoryItems.length;
    checkbox.indeterminate = activeCount > 0 && activeCount < categoryItems.length;
    
    checkbox.addEventListener("change", () => toggleCategory(categoryName, checkbox.checked));
    
    const label = document.createElement("label");
    label.htmlFor = "cat_" + categoryName;
    label.innerHTML = `<strong>${categoryName}</strong> <span class="category-count">(${activeCount}/${categoryItems.length})</span>`;
    
    div.appendChild(checkbox);
    div.appendChild(label);
    container.appendChild(div);
  }
  
  // Add custom locations category if exists
  if (currentCustomLocations.length > 0) {
    const div = document.createElement("div");
    div.className = "category-toggle-item custom-category";
    
    const label = document.createElement("label");
    label.innerHTML = `<strong>⭐ Özel Değerler</strong> <span class="category-count">(${currentCustomLocations.length})</span>`;
    
    div.appendChild(label);
    container.appendChild(div);
  }
}

// Toggle entire category on/off
function toggleCategory(categoryName, enabled) {
  const categoryItems = allCategories[categoryName] || [];
  let newLocations = [...currentLocations];
  
  if (enabled) {
    // Add all items from this category
    categoryItems.forEach(item => {
      if (!newLocations.includes(item)) {
        newLocations.push(item);
      }
    });
  } else {
    // Remove all items from this category
    newLocations = newLocations.filter(loc => !categoryItems.includes(loc));
  }
  
  socket.emit("update_locations", { roomId: myRoomId, locations: newLocations });
}

// Render individual location checkboxes (grouped by category)
function renderLocationCheckboxes(activeLocations) {
  const container = document.getElementById("locationsCheckboxes");
  container.innerHTML = "";
  
  for (const [categoryName, categoryItems] of Object.entries(allCategories)) {
    // Category header
    const categoryHeader = document.createElement("div");
    categoryHeader.className = "category-header";
    categoryHeader.textContent = categoryName;
    container.appendChild(categoryHeader);
    
    // Category items
    categoryItems.forEach(loc => {
      const div = document.createElement("div");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = loc;
      checkbox.id = "chk_" + loc;
      checkbox.checked = activeLocations.includes(loc);
      checkbox.style.width = "auto";
      
      const label = document.createElement("label");
      label.htmlFor = "chk_" + loc;
      label.textContent = loc;

      div.appendChild(checkbox);
      div.appendChild(label);
      container.appendChild(div);
    });
  }
  
  // Custom locations section
  if (currentCustomLocations.length > 0) {
    const categoryHeader = document.createElement("div");
    categoryHeader.className = "category-header custom";
    categoryHeader.textContent = "⭐ Özel Değerler";
    container.appendChild(categoryHeader);
    
    currentCustomLocations.forEach(loc => {
      const div = document.createElement("div");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = loc;
      checkbox.id = "chk_custom_" + loc;
      checkbox.checked = activeLocations.includes(loc);
      checkbox.style.width = "auto";
      
      const label = document.createElement("label");
      label.htmlFor = "chk_custom_" + loc;
      label.textContent = loc;
      label.style.color = "#ffc107";

      div.appendChild(checkbox);
      div.appendChild(label);
      container.appendChild(div);
    });
  }
}

// Render custom locations list with delete buttons
function renderCustomLocationsList() {
  const container = document.getElementById("customLocationsList");
  container.innerHTML = "";
  
  if (currentCustomLocations.length === 0) {
    container.innerHTML = "<p style='color: #888; font-size: 14px;'>Henüz özel değer eklenmedi.</p>";
    return;
  }
  
  currentCustomLocations.forEach(loc => {
    const div = document.createElement("div");
    div.className = "custom-location-item";
    
    const span = document.createElement("span");
    span.textContent = loc;
    
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.className = "delete-custom-btn";
    deleteBtn.onclick = () => removeCustomLocation(loc);
    
    div.appendChild(span);
    div.appendChild(deleteBtn);
    container.appendChild(div);
  });
}

// Add custom location
function addCustomLocation() {
  const input = document.getElementById("customLocationInput");
  const value = input.value.trim();
  
  if (!value) {
    showNotification("Lütfen bir değer girin", "error");
    return;
  }
  
  // Check if already exists
  const allExisting = [...Object.values(allCategories).flat(), ...currentCustomLocations];
  if (allExisting.includes(value)) {
    showNotification("Bu değer zaten mevcut!", "error");
    return;
  }
  
  socket.emit("add_custom_location", { roomId: myRoomId, location: value });
  input.value = "";
  showNotification("Değer eklendi: " + value, "success");
}

// Remove custom location
function removeCustomLocation(location) {
  socket.emit("remove_custom_location", { roomId: myRoomId, location });
  showNotification("Değer silindi: " + location, "info");
}

function updateLocations() {
  const checkboxes = document.querySelectorAll("#locationsCheckboxes input[type='checkbox']");
  const selected = [];
  checkboxes.forEach(cb => {
    if (cb.checked) selected.push(cb.value);
  });
  socket.emit("update_locations", { roomId: myRoomId, locations: selected });
}

function startGame() {
  socket.emit("start_game", { roomId: myRoomId });
}

socket.on("game_started", (data) => {
  if (!data.isReconnect) {
    showNotification("📢 Oyun Başlatılıyor!", 'success');
  }
  // console.log("🎮 Oyun başladı verisi geldi:", data);
  
  document.getElementById("lobbySection").classList.add("hidden");
  document.getElementById("gameSection").classList.remove("hidden");

  const roleText = document.getElementById("roleDisplay");
  const locText = document.getElementById("locationDisplay");

  if (roleText) roleText.innerText = "Rolün: " + data.role;
  if (locText) locText.innerText = data.role === "Casus" ? "Değeri bulmaya çalış!" : "Değer: " + data.location;

  // Update currentHostId if provided (e.g. on reconnect)
  if (data.hostId) {
    currentHostId = data.hostId;
  }

  // Show End Game button only for host
  const endGameBtn = document.getElementById("endGameBtn");
  if (socket.id === currentHostId) {
    endGameBtn.classList.remove("hidden");
  } else {
    endGameBtn.classList.add("hidden");
  }

  // Render locations in game section
  const gameLocList = document.getElementById("gameLocationsList");
  gameLocList.innerHTML = "";
  
  // Use the list sent with game_started event to ensure everyone sees it
  const locationsToShow = data.locationsList || currentLocations;
  
  locationsToShow.forEach(loc => {
    const li = document.createElement("li");
    li.textContent = loc;
    gameLocList.appendChild(li);
  });
});

function stopGame() {
  showConfirmation("Oyunu bitirmek ve lobiye dönmek istediğine emin misin?", () => {
    socket.emit("stop_game", { roomId: myRoomId });
  });
}

function leaveRoom() {
  showConfirmation("Odadan ayrılmak istediğine emin misin?", () => {
    sessionStorage.removeItem("spy_roomId");
    sessionStorage.removeItem("spy_name");
    location.reload();
  });
}

socket.on("game_ended", () => {
  showNotification("🛑 Oyun Sonlandı!", 'info');
  document.getElementById("gameSection").classList.add("hidden");
  document.getElementById("lobbySection").classList.remove("hidden");
});
