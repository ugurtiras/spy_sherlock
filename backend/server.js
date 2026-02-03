const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

const log = (...args) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
};

const rooms = {};

const CATEGORIES = {
  "Ünlüler": [
    "Mustafa Kemal Atatürk", "Kemal Sunal", "Barış Manço", "Sezen Aksu", "Tarkan",
    "Müslüm Gürses", "Cem Yılmaz", "Şener Şen", "Adile Naşit", "Haluk Bilginer",
    "Kıvanç Tatlıtuğ", "Kenan İmirzalıoğlu", "Beren Saat", "Serenay Sarıkaya",
    "Zeki Müren", "Aşık Veysel", "Neşet Ertaş", "Cüneyt Arkın", "Türkan Şoray",
    "Fatma Girik", "Filiz Akın", "Hülya Koçyiğit", "İlber Ortaylı", "Celal Şengör",
    "Hadise", "Murat Boz", "Acun Ilıcalı", "Taylor Swift", "Mine Tugay"
  ],
  "Sporcular": [
    "Fatih Terim", "Fernando Muslera", "Alex de Souza", "Gheorghe Hagi",
    "Cristiano Ronaldo", "Lionel Messi", "Lefter Küçükandonyadis", "Metin Oktay",
    "Arda Güler", "Hakan Şükür", "Rüştü Reçber", "Serena Williams"
  ],
  "Mekanlar": [
    "Hastane", "Okul", "Havalimanı", "Otel", "Restoran", "Sinema", "Banka",
    "Süpermarket", "Plaj", "Müze", "Kütüphane", "Stadyum", "Tren İstasyonu",
    "Lunapark", "Cami", "AVM", "Eczane", "Kuaför", "Spor Salonu", "Hastane"
  ],
  "Meslekler": [
    "Doktor", "Öğretmen", "Mühendis", "Avukat", "Aşçı", "Pilot", "Polis",
    "İtfaiyeci", "Hemşire", "Garson", "Kasap", "Berber", "Çiftçi", "Şoför",
    "Muhasebeci", "Mimar", "Gazeteci", "Fotoğrafçı", "Veteriner", "Eczacı"
  ],
  "Filmler & Diziler": [
    "Hababam Sınıfı", "Kurtlar Vadisi", "Ezel", "Behzat Ç.", "Leyla ile Mecnun",
    "Çukur", "Muhteşem Yüzyıl", "Avrupa Yakası", "Yalan Dünya", "Arka Sokaklar",
    "G.O.R.A.", "Recep İvedik", "Tosun Paşa", "Vizontele", "Babam ve Oğlum"
  ]
};

// app.get("/", (req, res) => {
//   res.sendFile(path.join(__dirname, "test.html"));
// });

io.on("connection", (socket) => {
  log("🟢 Bağlandı:", socket.id);

  // Send all available categories to the client upon connection
  socket.emit("init_info", { categories: CATEGORIES });

  socket.on("create_room", ({ name }) => {
    const roomId = generateRoomId();
    
    // Flatten all categories into one array for default locations
    const allLocations = Object.values(CATEGORIES).flat();
    
    rooms[roomId] = {
      hostId: socket.id,
      players: [],
      categories: JSON.parse(JSON.stringify(CATEGORIES)), // Deep copy categories
      locations: allLocations, // All locations enabled by default
      customLocations: [], // Custom locations added by host
      game: null
    };

    joinRoomLogic(socket, roomId, name);
  });

  socket.on("join_room", ({ roomId, name }) => {
    if (!rooms[roomId]) {
      socket.emit("error_message", "Oda bulunamadı!");
      return;
    }
    joinRoomLogic(socket, roomId, name);
  });

  function joinRoomLogic(socket, roomId, name) {
    socket.join(roomId);

    const room = rooms[roomId];
    const existingPlayer = room.players.find(p => p.name === name);

    if (existingPlayer) {
      // Reconnect logic
      log(`🔄 ${name} tekrar bağlandı (${roomId})`);
      
      // Update socket ID
      const oldId = existingPlayer.id;
      existingPlayer.id = socket.id;
      existingPlayer.connected = true;

      // If host reconnected, update hostId
      if (room.hostId === oldId) {
        room.hostId = socket.id;
      }

      // If game is active, update spyId if needed and send game state
      if (room.game) {
        if (room.game.spyId === oldId) {
          room.game.spyId = socket.id;
        }

        const isSpy = room.game.spyId === socket.id;
        const role = isSpy ? "Casus" : "Sivil";
        const loc = isSpy ? "???" : room.game.location;

        socket.emit("join_success", { roomId }); // Ensure client sets up UI
        socket.emit("game_started", {
          role,
          location: loc,
          locationsList: room.locations,
          isReconnect: true,
          hostId: room.hostId
        });
      } else {
        socket.emit("join_success", { roomId });
      }
    } else {
      // New player logic
      room.players.push({
        id: socket.id,
        name,
        connected: true
      });

      log(`${name} → ${roomId} odasına girdi`);
      socket.emit("join_success", { roomId });
    }

    io.to(roomId).emit("room_update", {
      players: room.players.filter(p => p.connected), // Only show connected players? Or show all? Let's show all for now but maybe mark disconnected
      hostId: room.hostId,
      locations: room.locations,
      categories: room.categories,
      customLocations: room.customLocations
    });
  }

function generateRoomId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  do {
    result = "";
    for (let i = 0; i < 7; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[result]); // Ensure uniqueness
  return result;
}

  socket.on("update_locations", ({ roomId, locations, customLocations }) => {
    const room = rooms[roomId];
    if (room && room.hostId === socket.id) {
      room.locations = locations;
      if (customLocations !== undefined) {
        room.customLocations = customLocations;
      }
      io.to(roomId).emit("room_update", {
        players: room.players,
        hostId: room.hostId,
        locations: room.locations,
        categories: room.categories,
        customLocations: room.customLocations
      });
    }
  });

  // Add custom location
  socket.on("add_custom_location", ({ roomId, location }) => {
    const room = rooms[roomId];
    if (room && room.hostId === socket.id && location && location.trim()) {
      const trimmedLocation = location.trim();
      if (!room.customLocations.includes(trimmedLocation)) {
        room.customLocations.push(trimmedLocation);
        room.locations.push(trimmedLocation);
        io.to(roomId).emit("room_update", {
          players: room.players,
          hostId: room.hostId,
          locations: room.locations,
          categories: room.categories,
          customLocations: room.customLocations
        });
      }
    }
  });

  // Remove custom location
  socket.on("remove_custom_location", ({ roomId, location }) => {
    const room = rooms[roomId];
    if (room && room.hostId === socket.id) {
      room.customLocations = room.customLocations.filter(l => l !== location);
      room.locations = room.locations.filter(l => l !== location);
      io.to(roomId).emit("room_update", {
        players: room.players,
        hostId: room.hostId,
        locations: room.locations,
        categories: room.categories,
        customLocations: room.customLocations
      });
    }
  });

  socket.on("start_game", ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.hostId === socket.id) {
      if (room.players.length < 3) {
        // Optional: Enforce minimum players? For testing we might allow 1 or 2.
        // socket.emit("error_message", "En az 3 oyuncu gerekli!");
        // return;
      }

      const location = room.locations[Math.floor(Math.random() * room.locations.length)];
      const spyIndex = Math.floor(Math.random() * room.players.length);
      const spyId = room.players[spyIndex].id;

      room.game = {
        location,
        spyId
      };

      log(`🎲 Oyun Başladı: Oda ${roomId}, Kişi: ${location}, Casus: ${room.players[spyIndex].name}`);

      // Send roles to each player
      room.players.forEach(player => {
        const isSpy = player.id === spyId;
        const role = isSpy ? "Casus" : "Sivil";
        const loc = isSpy ? "???" : location;
        
        log(`📤 Gönderiliyor: ${player.name} (${player.id}) -> Rol: ${role}`);

        io.to(player.id).emit("game_started", {
          role,
          location: loc,
          locationsList: room.locations
        });
      });
    }
  });

  socket.on("stop_game", ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.hostId === socket.id) {
      room.game = null;
      io.to(roomId).emit("game_ended");
      // Also send room update to ensure lobby is fresh
      io.to(roomId).emit("room_update", {
        players: room.players,
        hostId: room.hostId,
        locations: room.locations,
        categories: room.categories,
        customLocations: room.customLocations
      });
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        
        if (room.game) {
          // Game is active, mark as disconnected but don't remove
          log(`⚠️ ${player.name} oyundan düştü (Oda: ${roomId})`);
          player.connected = false;
          // We don't emit room_update here to avoid disrupting others
        } else {
          // No game, remove player
          const wasHost = room.hostId === socket.id;
          room.players.splice(playerIndex, 1);

          if (room.players.length === 0) {
            delete rooms[roomId];
          } else {
            if (wasHost) {
              room.hostId = room.players[0].id; // Assign new host
            }
            
            io.to(roomId).emit("room_update", {
              players: room.players, // We might want to filter connected ones if we kept them
              hostId: room.hostId,
              locations: room.locations,
              categories: room.categories,
              customLocations: room.customLocations
            });
          }
          log("🔴 Ayrıldı:", socket.id);
        }
      }
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Server ${process.env.PORT || 3000} portunda`);
});
