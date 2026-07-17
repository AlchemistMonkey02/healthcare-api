const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Load GeoJSON data
const geojsonPath = path.join(__dirname, './INDIA_HEALTH_FACILITIES_NIC.geojson');
let geojsonData = { features: [] };
let facilityStats = { CHC: 0, PHC: 0, Others: 0 };
let facilities = [];

console.log('Loading GeoJSON data...');
try {
  const rawData = fs.readFileSync(geojsonPath, 'utf8');
  geojsonData = JSON.parse(rawData);
  
  geojsonData.features.forEach(feature => {
    const type = feature.properties.type;
    const coords = feature.geometry?.coordinates;
    const facilityInfo = {
      id: feature.properties.village_id || Math.random().toString(36).substr(2, 9),
      name: feature.properties.name,
      type: feature.properties.type,
      place: feature.properties.place,
      district: feature.properties.district,
      state: feature.properties.state,
      latitude: coords ? coords[1] : null,
      longitude: coords ? coords[0] : null
    };

    if (type === 'CHC') facilityStats.CHC++;
    else if (type === 'PHC') facilityStats.PHC++;
    else facilityStats.Others++;

    facilities.push(facilityInfo);
  });
  console.log(`Loaded ${facilities.length} facilities successfully.`);
  console.log(`Stats:`, facilityStats);
} catch (error) {
  console.error('Error loading geojson data:', error);
}

// 1. Get stats (Count of CHC, PHC) - now supports state and district filters
app.get('/api/stats', (req, res) => {
  const { state, district } = req.query;

  if (!state && !district) {
    return res.json({
      success: true,
      data: facilityStats
    });
  }

  let filtered = facilities;
  if (state) filtered = filtered.filter(f => f.state && f.state.toUpperCase() === state.toUpperCase());
  if (district) filtered = filtered.filter(f => f.district && f.district.toUpperCase() === district.toUpperCase());

  let stats = { CHC: 0, PHC: 0, Others: 0 };
  filtered.forEach(f => {
    if (f.type === 'CHC') stats.CHC++;
    else if (f.type === 'PHC') stats.PHC++;
    else stats.Others++;
  });

  res.json({
    success: true,
    data: stats,
    totalFiltered: filtered.length
  });
});

// 2. Get list of facilities (with their latitude and longitude)
// Optional query params: ?type=CHC&state=MAHARASHTRA&district=Raigarh&limit=50&page=1
app.get('/api/facilities', (req, res) => {
  const { type, state, district, limit = 50, page = 1 } = req.query;
  
  let filtered = facilities;
  if (type) {
    const types = type.split(',').map(t => t.trim().toUpperCase());
    filtered = filtered.filter(f => f.type && types.includes(f.type.toUpperCase()));
  }
  if (state) {
    filtered = filtered.filter(f => f.state && f.state.toUpperCase() === state.toUpperCase());
  }
  if (district) {
    filtered = filtered.filter(f => f.district && f.district.toUpperCase() === district.toUpperCase());
  }

  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const result = filtered.slice(startIndex, endIndex);

  res.json({
    success: true,
    page: parseInt(page),
    limit: parseInt(limit),
    total: filtered.length,
    data: result
  });
});

// 3. Reverse Geocoding API to get location of a facility using external API (Nominatim OSM)
app.get('/api/reverse-geocode', async (req, res) => {
  const { lat, lon } = req.query;
  
  if (!lat || !lon) {
    return res.status(400).json({ success: false, message: 'Please provide lat and lon parameters' });
  }

  try {
    // We use OpenStreetMap's Nominatim API for reverse geocoding
    // IMPORTANT: It has usage limits, so use cautiously. Include a unique User-Agent.
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'NodeProfessionalAPI/1.0'
      }
    });

    res.json({
      success: true,
      data: {
        latitude: lat,
        longitude: lon,
        address: response.data.address,
        display_name: response.data.display_name
      }
    });
  } catch (error) {
    console.error('Reverse geocoding error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reverse geocode', 
      error: error.message 
    });
  }
});

app.listen(port, () => {
  console.log(`Node Professional API running on http://localhost:${port}`);
  console.log('Endpoints:');
  console.log(' - GET /api/stats');
  console.log(' - GET /api/facilities?type=CHC');
  console.log(' - GET /api/reverse-geocode?lat=18.25972&lon=73.12620');
});
