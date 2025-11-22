// Track metrics by endpoint
const endpointMetrics = {};

export function generateRandomUser(context, events, done) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  
  context.vars.username = `loadtest_${timestamp}_${random}`;
  context.vars.email = `${context.vars.username}@test.com`;
  context.vars.password = 'TestPass123!';
  
  return done();
}

export function selectRandomModel(context, events, done) {
  const models = ['player1.png', 'player2.png', 'player3.png', 'player4.png'];
  context.vars.model = models[Math.floor(Math.random() * models.length)];
  return done();
}

export function generateGameInput(context, events, done) {
  context.vars.rotation = Math.random() > 0.5 ? 1 : (Math.random() > 0.5 ? -1 : 0);
  context.vars.shoot = Math.random() > 0.8 ? 'true' : 'null';
  return done();
}

export function logResponse(requestParams, response, context, ee, next) {
  if (response.statusCode >= 400) {
    console.log(`Error: ${response.statusCode} - ${requestParams.url}`);
  }
  return next();
}

// Track metrics before request
export function metricsByEndpoint_beforeRequest(requestParams, context, ee, next) {
  const endpoint = requestParams.url;
  context.vars._startTime = Date.now();
  context.vars._endpoint = endpoint;
  
  if (!endpointMetrics[endpoint]) {
    endpointMetrics[endpoint] = {
      count: 0,
      errors: 0,
      totalTime: 0
    };
  }
  
  endpointMetrics[endpoint].count++;
  return next();
}

// Track metrics after response
export function metricsByEndpoint_afterResponse(requestParams, response, context, ee, next) {
  const endpoint = context.vars._endpoint;
  const duration = Date.now() - context.vars._startTime;
  
  if (endpointMetrics[endpoint]) {
    endpointMetrics[endpoint].totalTime += duration;
    
    if (response.statusCode >= 400) {
      endpointMetrics[endpoint].errors++;
      ee.emit('counter', `errors.${endpoint}`, 1);
    }
    
    // Emit custom metrics
    ee.emit('histogram', `response_time.${endpoint}`, duration);
  }
  
  return next();
}

// Print summary at the end
export function printEndpointMetrics(context, ee, next) {
  console.log('\n=== Endpoint Metrics Summary ===');
  Object.entries(endpointMetrics).forEach(([endpoint, metrics]) => {
    const avgTime = metrics.count > 0 ? (metrics.totalTime / metrics.count).toFixed(2) : 0;
    const errorRate = metrics.count > 0 ? ((metrics.errors / metrics.count) * 100).toFixed(2) : 0;
    
    console.log(`\n${endpoint}:`);
    console.log(`  Requests: ${metrics.count}`);
    console.log(`  Errors: ${metrics.errors} (${errorRate}%)`);
    console.log(`  Avg Response Time: ${avgTime}ms`);
  });
  console.log('\n================================\n');
  
  return next();
}

// Setup WebSocket variables
export function setupWebSocket(context, events, done) {
  context.vars.wsUserId = Math.floor(Math.random() * 10000);
  context.vars.wsUsername = `ws_user_${context.vars.wsUserId}`;
  context.vars.lobbyId = `TEST-LOAD-${Math.floor(Math.random() * 10)}`;
  return done();
}

// Setup scenario (called before each scenario)
export function setupScenario(context, events, done) {
  context.vars.userId = Math.floor(Math.random() * 10000);
  context.vars.username = `loadtest_${context.vars.userId}`;
  context.vars.email = `${context.vars.username}@test.com`;
  context.vars.password = 'TestPass123!';
  return done();
}