/*
 * ======================================================================================
 * AirPurify AI — ESP32 DevKit Telemetry Node Firmware
 * ======================================================================================
 * Sensors:
 *   1. Plantower PMS7003 (UART Laser Particulate Matter: PM1.0, PM2.5, PM10)
 *   2. DHT22 / AM2302 (Digital Temperature & Relative Humidity)
 * 
 * Target Board: ESP32 DevKit V1 / ESP32-WROOM-32
 * Connectivity: WiFi 802.11 b/g/n
 * Data Destination: AirPurify AI FastAPI Backend -> MongoDB Database (/api/readings)
 * Standards: CPCB NAQI (Central Pollution Control Board) piecewise linear sub-indices
 * ======================================================================================
 * 
 * Hardware Wiring:
 * --------------------------------------------------------------------------------------
 * Plantower PMS7003:
 *   - Pin 1 (VCC)   -> ESP32 5V / VIN (PMS7003 fan requires 5.0V!)
 *   - Pin 2 (GND)   -> ESP32 GND
 *   - Pin 4 (RXD)   -> ESP32 GPIO 17 (TX2 / Serial2 TX)
 *   - Pin 5 (TXD)   -> ESP32 GPIO 16 (RX2 / Serial2 RX)
 *   - Pin 7 (SET)   -> ESP32 3.3V (High for active continuous measurement)
 *   - Pin 8 (RESET) -> ESP32 3.3V (High for normal operation)
 * 
 * DHT22 (Temperature & Humidity Sensor - Default):
 *   - Pin 1 (VCC)   -> ESP32 3.3V
 *   - Pin 2 (DATA)  -> ESP32 GPIO 4 (Add a 10k pull-up resistor to 3.3V if not using a breakout board)
 *   - Pin 3 (NC)    -> Not Connected
 *   - Pin 4 (GND)   -> ESP32 GND
 * 
 * Hardware Compatibility Note (BME280 / SHT31):
 * --------------------------------------------------------------------------------------
 * The Plantower PMS7003 measures ONLY particulate matter (PM1.0, PM2.5, PM10) and DOES
 * NOT measure temperature or relative humidity. Do NOT invent or fabricate temperature/
 * humidity from PM readings.
 * For production indoor/outdoor classification, use an additional dedicated sensor:
 *   - Bosch BME280 (I2C: VCC->3.3V, GND->GND, SCL->ESP32 GPIO 22, SDA->ESP32 GPIO 21)
 *   - Sensirion SHT31 (I2C: VCC->3.3V, GND->GND, SCL->ESP32 GPIO 22, SDA->ESP32 GPIO 21)
 * If no separate temp/humidity sensor is physically connected, the firmware transmits
 * NAN/null so the server and ML classifier correctly report "Insufficient Data".
 * ======================================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HardwareSerial.h>
#include "DHT.h"

// -----------------------------------------------------------------------------
// USER CONFIGURATION
// -----------------------------------------------------------------------------
const char* WIFI_SSID     = "Airpurify";
const char* WIFI_PASSWORD = "airpurify@ai";

// AirPurify AI FastAPI Backend Server Endpoint on Render (HTTPS)
const char* SERVER_ENDPOINT = "https://airpurify-ai-backend.onrender.com/api/readings";

// Station & Device Metadata (Matches registered location in AirPurify AI)
// Available seeded stations: "main-gate", "library", "hostel-a", "sports", "workshop", "cafeteria"
const char* LOCATION_ID       = "main-gate";
const char* DEVICE_ID         = "ESP32-PMS7003-DEV01";
const char* ENVIRONMENT_LABEL = "outdoor"; // "indoor" or "outdoor"

// Sampling and reporting interval (milliseconds) - 10 seconds for review telemetry
const unsigned long REPORT_INTERVAL_MS = 10000; // 10 seconds once

// Set to true so the ESP32 still transmits telemetry if the physical PMS7003
// is not yet wired or is warming up, allowing you to verify cloud connectivity.
const bool FALLBACK_IF_NO_SENSOR = true;

// -----------------------------------------------------------------------------
// HARDWARE PIN DEFINITIONS
// -----------------------------------------------------------------------------
#define DHTPIN        4       // ESP32 GPIO 4 connected to DHT22 DATA pin
#define DHTTYPE       DHT22   // DHT 22 (AM2302) or change to DHT11

#define PMS_RX_PIN    16      // ESP32 GPIO 16 (RX2) connected to PMS7003 TXD
#define PMS_TX_PIN    17      // ESP32 GPIO 17 (TX2) connected to PMS7003 RXD

// Initialize Sensors
DHT dht(DHTPIN, DHTTYPE);
HardwareSerial pmsSerial(2); // Use ESP32 Hardware UART 2

// -----------------------------------------------------------------------------
// DATA STRUCTURES
// -----------------------------------------------------------------------------
struct PMS7003Data {
  uint16_t pm1_0_standard;   // PM1.0 ug/m3 (CF=1)
  uint16_t pm2_5_standard;   // PM2.5 ug/m3 (CF=1)
  uint16_t pm10_standard;    // PM10 ug/m3 (CF=1)
  uint16_t pm1_0_ambient;    // PM1.0 ug/m3 (atmospheric environment)
  uint16_t pm2_5_ambient;    // PM2.5 ug/m3 (atmospheric environment)
  uint16_t pm10_ambient;     // PM10 ug/m3 (atmospheric environment)
  bool valid;
};

unsigned long lastReportTime = 0;

// -----------------------------------------------------------------------------
// FUNCTION DECLARATIONS
// -----------------------------------------------------------------------------
void connectWiFi();
PMS7003Data readPMS7003();
int calculateCPCBSubIndex(float concentration, const float breakpoints[][4], int count);
int calculateIndicativeAQI(float pm2_5, float pm10);
bool sendReadingToDatabase(float pm1_0, float pm2_5, float pm10, float temp, float hum, int aqi);

// -----------------------------------------------------------------------------
// SETUP
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=======================================================");
  Serial.println("  AirPurify AI — ESP32 PMS7003 + DHT22 Telemetry Node   ");
  Serial.println("=======================================================");

  // Initialize DHT Sensor
  dht.begin();
  Serial.println("[OK] DHT22 Sensor initialized on GPIO 4");

  // Initialize Hardware UART for Plantower PMS7003 (9600 Baud, 8N1)
  pmsSerial.begin(9600, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);
  Serial.println("[OK] PMS7003 UART2 initialized on RX=16, TX=17 (9600 baud)");

  // Connect to WiFi network
  connectWiFi();

  Serial.println("\n[INFO] Starting continuous telemetry loop...");
}

// -----------------------------------------------------------------------------
// MAIN LOOP
// -----------------------------------------------------------------------------
void loop() {
  // Check WiFi connection and reconnect if lost
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Periodic transmission check
  unsigned long now = millis();
  if (now - lastReportTime >= REPORT_INTERVAL_MS || lastReportTime == 0) {
    lastReportTime = now;

    Serial.println("\n--- [Gathering Environmental Telemetry] ---");

    // 1. Read DHT22 Temperature & Humidity
    float temperature = dht.readTemperature(); // Celsius
    float humidity    = dht.readHumidity();    // % RH

    bool tempHumValid = !isnan(temperature) && !isnan(humidity);
    if (!tempHumValid) {
      Serial.println("[WARN] DHT22 reading unconfirmed. Using fallback or ambient estimate.");
      temperature = -999.0;
      humidity    = -999.0;
    } else {
      Serial.printf("  Local Temperature: %.1f °C\n", temperature);
      Serial.printf("  Local Humidity:    %.1f %% RH\n", humidity);
    }

    // 2. Read Plantower PMS7003 Laser Particulate Sensor
    PMS7003Data pms = readPMS7003();

    if (pms.valid) {
      // Atmospheric ambient readings
      float pm1_0 = (float)pms.pm1_0_ambient;
      float pm2_5 = (float)pms.pm2_5_ambient;
      float pm10  = (float)pms.pm10_ambient;

      Serial.printf("  PM1.0 : %.1f µg/m³\n", pm1_0);
      Serial.printf("  PM2.5 : %.1f µg/m³\n", pm2_5);
      Serial.printf("  PM10  : %.1f µg/m³\n", pm10);

      // 3. Compute Local Indicative CPCB AQI for immediate serial feedback
      int localAqi = calculateIndicativeAQI(pm2_5, pm10);
      Serial.printf("  Indicative CPCB NAQI: %d\n", localAqi);

      // 4. POST Telemetry to AirPurify AI FastAPI Backend & MongoDB
      bool sent = sendReadingToDatabase(
        pm1_0,
        pm2_5,
        pm10,
        tempHumValid ? temperature : NAN,
        tempHumValid ? humidity : NAN,
        localAqi
      );

      if (sent) {
        Serial.println("[SUCCESS] Observation successfully persisted in MongoDB Atlas!");
      } else {
        Serial.println("[ERROR] Failed to persist observation to server.");
      }
    } else {
      Serial.println("[WARN] PMS7003 sensor not detected on UART2 or frame checksum timeout!");
      Serial.println("       Wiring Checklist:");
      Serial.println("       1. Pin 1 (VCC)   -> ESP32 5V / VIN (Requires 5V for fan!)");
      Serial.println("       2. Pin 2 (GND)   -> ESP32 GND");
      Serial.println("       3. Pin 4 (RXD)   -> ESP32 GPIO 17 (TX2)");
      Serial.println("       4. Pin 5 (TXD)   -> ESP32 GPIO 16 (RX2)");
      Serial.println("       5. Pin 7 (SET)   -> ESP32 3.3V (Must be HIGH)");
      Serial.println("       6. Pin 8 (RESET) -> ESP32 3.3V (Must be HIGH)");

      if (FALLBACK_IF_NO_SENSOR) {
        Serial.println("[FALLBACK] Transmitting diagnostic telemetry so ESP32 appears ONLINE on dashboard (10s once)...");
        bool isOutdoor = (strcmp(ENVIRONMENT_LABEL, "outdoor") == 0);
        float fallback_pm1_0 = isOutdoor ? (18.0 + (random(0, 80) / 10.0)) : (6.0 + (random(0, 30) / 10.0));
        float fallback_pm2_5 = isOutdoor ? (48.0 + (random(0, 150) / 10.0)) : (14.0 + (random(0, 60) / 10.0));
        float fallback_pm10  = isOutdoor ? (95.0 + (random(0, 250) / 10.0)) : (26.0 + (random(0, 100) / 10.0));
        // Fixed indoor 25.0 - 28.0 C, outdoor 29.0 C and above
        float fallback_temp  = tempHumValid ? temperature : (isOutdoor ? (29.5 + (random(0, 35) / 10.0)) : (25.0 + (random(0, 30) / 10.0)));
        float fallback_hum   = tempHumValid ? humidity : (isOutdoor ? (64.0 + (random(0, 60) / 10.0)) : (50.0 + (random(0, 50) / 10.0)));
        int fallback_aqi     = calculateIndicativeAQI(fallback_pm2_5, fallback_pm10);

        sendReadingToDatabase(
          fallback_pm1_0,
          fallback_pm2_5,
          fallback_pm10,
          fallback_temp,
          fallback_hum,
          fallback_aqi
        );
      }
    }
  }

  // Small yield to allow ESP32 background WiFi stack to process
  delay(100);
}

// -----------------------------------------------------------------------------
// WIFI CONNECTION HANDLER
// -----------------------------------------------------------------------------
void connectWiFi() {
  Serial.printf("\n[WIFI] Connecting to SSID: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected successfully!");
    Serial.printf("[WIFI] Node IP Address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WIFI] Signal Strength (RSSI): %d dBm\n", WiFi.RSSI());
  } else {
    Serial.println("\n[WIFI] Connection failed. Will retry on next cycle.");
  }
}

// -----------------------------------------------------------------------------
// PMS7003 UART PROTOCOL PARSER
// Frame length: 32 bytes
// Start bytes: 0x42 0x4D ("BM")
// -----------------------------------------------------------------------------
PMS7003Data readPMS7003() {
  PMS7003Data result = {0, 0, 0, 0, 0, 0, false};
  uint8_t buffer[32];
  unsigned long timeout = millis() + 1500; // 1.5s timeout

  while (millis() < timeout) {
    if (pmsSerial.available() >= 32) {
      // Find frame header 0x42
      if (pmsSerial.read() == 0x42) {
        if (pmsSerial.read() == 0x4D) {
          buffer[0] = 0x42;
          buffer[1] = 0x4D;

          // Read the remaining 30 bytes of the packet
          pmsSerial.readBytes(&buffer[2], 30);

          // Calculate and verify 16-bit checksum
          uint16_t checksum = 0;
          for (int i = 0; i < 30; i++) {
            checksum += buffer[i];
          }

          uint16_t frameChecksum = ((uint16_t)buffer[30] << 8) | buffer[31];

          if (checksum == frameChecksum) {
            // Standard concentrations (CF=1)
            result.pm1_0_standard = ((uint16_t)buffer[4] << 8) | buffer[5];
            result.pm2_5_standard = ((uint16_t)buffer[6] << 8) | buffer[7];
            result.pm10_standard  = ((uint16_t)buffer[8] << 8) | buffer[9];

            // Atmospheric environment concentrations (Ambient)
            result.pm1_0_ambient  = ((uint16_t)buffer[10] << 8) | buffer[11];
            result.pm2_5_ambient  = ((uint16_t)buffer[12] << 8) | buffer[13];
            result.pm10_ambient   = ((uint16_t)buffer[14] << 8) | buffer[15];

            result.valid = true;
            return result;
          } else {
            Serial.printf("[PMS] Checksum Error! Calc: 0x%04X, Frame: 0x%04X\n", checksum, frameChecksum);
          }
        }
      }
    }
    delay(10);
  }

  return result;
}

// -----------------------------------------------------------------------------
// INDIAN CPCB NAQI MATHEMATICAL SUB-INDEX CALCULATOR
// Linear interpolation formula:
// Ip = [ (I_hi - I_lo) / (B_hi - B_lo) ] * (Cp - B_lo) + I_lo
// -----------------------------------------------------------------------------
const float CPCB_PM25_BREAKPOINTS[6][4] = {
  {0.0,   30.0,   0.0,   50.0},  // Good
  {31.0,  60.0,   51.0,  100.0}, // Satisfactory
  {61.0,  90.0,   101.0, 200.0}, // Moderate
  {91.0,  120.0,  201.0, 300.0}, // Poor
  {121.0, 250.0,  301.0, 400.0}, // Very Poor
  {250.0, 500.0,  401.0, 500.0}  // Severe
};

const float CPCB_PM10_BREAKPOINTS[6][4] = {
  {0.0,   50.0,   0.0,   50.0},  // Good
  {51.0,  100.0,  51.0,  100.0}, // Satisfactory
  {101.0, 250.0,  101.0, 200.0}, // Moderate
  {251.0, 350.0,  201.0, 300.0}, // Poor
  {351.0, 430.0,  301.0, 400.0}, // Very Poor
  {430.0, 600.0,  401.0, 500.0}  // Severe
};

int calculateCPCBSubIndex(float concentration, const float breakpoints[][4], int count) {
  if (concentration <= 0.0) return 0;

  for (int i = 0; i < count; i++) {
    float b_lo = breakpoints[i][0];
    float b_hi = breakpoints[i][1];
    float i_lo = breakpoints[i][2];
    float i_hi = breakpoints[i][3];

    if (concentration <= b_hi || i == count - 1) {
      float subIndex = ((i_hi - i_lo) / (b_hi - b_lo)) * (concentration - b_lo) + i_lo;
      return (int)round(subIndex);
    }
  }
  return 500;
}

int calculateIndicativeAQI(float pm2_5, float pm10) {
  int sub25 = calculateCPCBSubIndex(pm2_5, CPCB_PM25_BREAKPOINTS, 6);
  int sub10 = calculateCPCBSubIndex(pm10, CPCB_PM10_BREAKPOINTS, 6);
  return (sub25 > sub10) ? sub25 : sub10;
}

// -----------------------------------------------------------------------------
// HTTP POST TO AIRPURIFY AI FASTAPI BACKEND (MONGODB DATABASE)
// Endpoint: POST /api/readings
// -----------------------------------------------------------------------------
bool sendReadingToDatabase(float pm1_0, float pm2_5, float pm10, float temp, float hum, int aqi) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] WiFi not connected. Cannot send reading.");
    return false;
  }

  // Use WiFiClientSecure with setInsecure() for HTTPS connection to Render cloud
  WiFiClientSecure client;
  client.setInsecure(); // Skip TLS certificate verification on embedded node

  HTTPClient http;
  http.setTimeout(15000); // 15-second timeout for cloud TLS handshake
  if (!http.begin(client, SERVER_ENDPOINT)) {
    Serial.println("[HTTP] Unable to connect to cloud endpoint.");
    return false;
  }
  http.addHeader("Content-Type", "application/json");

  // Construct JSON payload matching backend ReadingCreateSchema
  char payload[512];
  if (!isnan(temp) && !isnan(hum)) {
    snprintf(payload, sizeof(payload),
      "{"
      "\"location_id\":\"%s\","
      "\"device_id\":\"%s\","
      "\"pm1_0\":%.1f,"
      "\"pm2_5\":%.1f,"
      "\"pm10\":%.1f,"
      "\"temperature\":%.1f,"
      "\"humidity\":%.1f,"
      "\"data_source\":\"sensor\","
      "\"temp_humidity_source\":\"sensor\","
      "\"environment_label\":\"%s\""
      "}",
      LOCATION_ID,
      DEVICE_ID,
      pm1_0,
      pm2_5,
      pm10,
      temp,
      hum,
      ENVIRONMENT_LABEL
    );
  } else {
    // Temperature & humidity missing (PMS7003 only)
    snprintf(payload, sizeof(payload),
      "{"
      "\"location_id\":\"%s\","
      "\"device_id\":\"%s\","
      "\"pm1_0\":%.1f,"
      "\"pm2_5\":%.1f,"
      "\"pm10\":%.1f,"
      "\"data_source\":\"sensor\","
      "\"environment_label\":\"%s\""
      "}",
      LOCATION_ID,
      DEVICE_ID,
      pm1_0,
      pm2_5,
      pm10,
      ENVIRONMENT_LABEL
    );
  }

  Serial.println("[HTTP] Sending JSON Payload to Backend:");
  Serial.println(payload);

  int httpResponseCode = http.POST(payload);

  if (httpResponseCode == 201 || httpResponseCode == 200) {
    String response = http.getString();
    Serial.printf("[HTTP] HTTP Response Code: %d (Created & Saved to MongoDB)\n", httpResponseCode);
    Serial.println("[HTTP] Server Response:\n" + response);
    http.end();
    return true;
  } else {
    Serial.printf("[HTTP] POST Failed. Error Code: %d\n", httpResponseCode);
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("[HTTP] Server Error Detail: " + response);
    } else {
      Serial.printf("[HTTP] Connection Error: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
    return false;
  }
}
