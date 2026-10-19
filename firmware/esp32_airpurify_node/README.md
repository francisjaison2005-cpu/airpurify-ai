# AirPurify AI — ESP32 Sensor Telemetry Node

Complete embedded firmware for the **ESP32 DevKit** reading a **Plantower PMS7003** (Laser Particulate Sensor) and **DHT22** (Temperature & Humidity), calculating CPCB NAQI, and transmitting observations to the **AirPurify AI FastAPI Backend** and **MongoDB Database**.

---

## 1. Hardware Requirements

| Component | Description | Operating Voltage |
| :--- | :--- | :--- |
| **ESP32 DevKit V1** | 30-pin or 38-pin ESP32-WROOM-32 board | 5V (USB) / 3.3V Logic |
| **Plantower PMS7003** | Laser scattering PM1.0, PM2.5, PM10 sensor | **5.0V VCC** (Fan requires 5V!) |
| **PMS7003 Breakout Adapter** | 8-pin 1.25mm pitch to 2.54mm pin header adapter | — |
| **DHT22 (AM2302) or DHT11** | Digital Temperature & Relative Humidity sensor | 3.3V – 5.0V |
| **Resistor** | 10kΩ pull-up resistor for DHT22 DATA (if bare sensor) | — |
| **Jumper Wires & Breadboard** | Standard prototyping connections | — |

---

## 2. Pinout & Wiring Connections

### A. Plantower PMS7003 to ESP32 DevKit

> [!IMPORTANT]
> The Plantower PMS7003 internal intake fan **requires 5.0V** on Pin 1 (VCC / VIN). Connecting it to 3.3V will cause fan stalling and erratic or zero particulate readings! The UART logic pins are 3.3V-tolerant.

| PMS7003 Pin | Signal Name | ESP32 DevKit Pin | Function |
| :--- | :--- | :--- | :--- |
| **Pin 1** | **VCC** | **5V / VIN** | 5.0V Power for internal fan and laser |
| **Pin 2** | **GND** | **GND** | Ground |
| **Pin 4** | **RXD** | **GPIO 17 (TX2)** | UART Receive on PMS7003 |
| **Pin 5** | **TXD** | **GPIO 16 (RX2)** | UART Transmit on PMS7003 (32-byte frames) |
| **Pin 7** | **SET** | **3.3V** | Operating mode: High (Active continuous mode) |
| **Pin 8** | **RESET** | **3.3V** | Reset: High (Normal operation) |

*(Pins 3 and 6 on the PMS7003 are not needed and can be left disconnected).*

---

### B. DHT22 / AM2302 to ESP32 DevKit

| DHT22 Pin | Signal | ESP32 Pin | Notes |
| :--- | :--- | :--- | :--- |
| **Pin 1** | **VCC** | **3.3V** | Power (or 5V if specified on module) |
| **Pin 2** | **DATA** | **GPIO 4** | 10kΩ pull-up resistor to 3.3V |
| **Pin 3** | **NC** | — | Not connected |
| **Pin 4** | **GND** | **GND** | Ground |

---

## 3. Arduino IDE Setup & Required Libraries

1. **Install ESP32 Board Package**:
   - Open Arduino IDE $\rightarrow$ **File** $\rightarrow$ **Preferences**.
   - Add this URL to *Additional Boards Manager URLs*:
     ```text
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Go to **Tools** $\rightarrow$ **Board** $\rightarrow$ **Boards Manager**, search for `esp32` by Espressif Systems, and click **Install**.
   - Under **Tools** $\rightarrow$ **Board**, select `DOIT ESP32 DEVKIT V1` (or your specific ESP32 board).

2. **Install Libraries**:
   - Open **Sketch** $\rightarrow$ **Include Library** $\rightarrow$ **Manage Libraries...**
   - Search for **"DHT sensor library"** by **Adafruit** and click **Install** (also install *Adafruit Unified Sensor* when prompted).
   - *(Note: `WiFi.h`, `HTTPClient.h`, and `HardwareSerial.h` are built directly into the ESP32 core).*

---

## 4. Configuration Instructions

Open [`esp32_airpurify_node.ino`](file:///d:/project/thenam/insight-hub-main/insight-hub-main/firmware/esp32_airpurify_node/esp32_airpurify_node.ino) and modify the top configuration section:

```cpp
// 1. Your Local WiFi Credentials
const char* WIFI_SSID     = "Your_Home_Or_Campus_WiFi";
const char* WIFI_PASSWORD = "Your_WiFi_Password";

// 2. Your Computer's Local IP Running the FastAPI Backend
// (Find your IP on Windows using 'ipconfig' in Command Prompt or PowerShell)
const char* SERVER_ENDPOINT = "http://192.168.1.100:8000/api/readings";

// 3. Station Metadata
const char* LOCATION_ID       = "main-gate";           // Matches station ID in database
const char* DEVICE_ID         = "ESP32-PMS7003-DEV01"; // Unique node identifier
const char* ENVIRONMENT_LABEL = "outdoor";             // "indoor" or "outdoor"
```

---

## 5. Verifying Data Flow

1. Ensure your backend and frontend are running:
   ```bash
   # Terminal 1: Backend
   python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
   
   # Terminal 2: Frontend
   npm run dev
   ```

2. Flash the sketch to your ESP32 board via USB.
3. Open the Arduino Serial Monitor at **115200 baud**.
4. You will observe:
   ```text
   [WIFI] Connected successfully!
   [WIFI] Node IP Address: 192.168.1.45
   --- [Gathering Environmental Telemetry] ---
     Local Temperature: 25.4 °C
     Local Humidity:    52.1 % RH
     PM1.0 : 12.0 µg/m³
     PM2.5 : 28.0 µg/m³
     PM10  : 54.0 µg/m³
     Indicative CPCB NAQI: 54
   [HTTP] Sending JSON Payload to Backend:
   {"location_id":"main-gate","device_id":"ESP32-PMS7003-DEV01","pm1_0":12.0,"pm2_5":28.0,"pm10":54.0,"temperature":25.4,"humidity":52.1,"data_source":"sensor","temp_humidity_source":"sensor","environment_label":"outdoor"}
   [HTTP] HTTP Response Code: 201 (Created & Saved to MongoDB)
   [SUCCESS] Observation successfully persisted in MongoDB Atlas!
   ```
5. Open your browser at `http://localhost:8080/`. You will see the live readings, indicative AQI, and 24-hour charts update in real-time from your physical ESP32 node!
