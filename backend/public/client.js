const socket = io();
let myRoomId = "";
let timerInterval;
let allAvailableLocations = [];

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
  allAvailableLocations = data.allLocations;
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
    lList.appendChild(li);
  });

  // Host Controls
  const isHost = socket.id === data.hostId;
  const hostControls = document.getElementById("hostControls");
  if (isHost) {
    hostControls.classList.remove("hidden");
    renderLocationCheckboxes(data.locations);
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

function renderLocationCheckboxes(activeLocations) {
  const container = document.getElementById("locationsCheckboxes");
  // Only render if empty or we want to update checked state
  // But to avoid re-rendering and losing scroll position, we can just update checked status
  
  if (container.children.length === 0 && allAvailableLocations.length > 0) {
    allAvailableLocations.forEach(loc => {
      const div = document.createElement("div");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = loc;
      checkbox.id = "chk_" + loc;
      checkbox.style.width = "auto"; // override default width
      
      const label = document.createElement("label");
      label.htmlFor = "chk_" + loc;
      label.textContent = loc;

      div.appendChild(checkbox);
      div.appendChild(label);
      container.appendChild(div);
    });
  }

  // Update checked state
  const checkboxes = container.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach(cb => {
    cb.checked = activeLocations.includes(cb.value);
  });
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
  if (locText) locText.innerText = data.role === "Casus" ? "Mekanı bulmaya çalış!" : "Mekan: " + data.location;

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
    li.style.margin = "5px";
    li.style.padding = "5px 10px";
    li.style.background = "#333";
    li.style.borderRadius = "4px";
    li.style.listStyle = "none";
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
