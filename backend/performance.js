// Performance monitoring utilities

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.startTimes = new Map();
    }
    
    // Start timing an operation
    startTimer(operationName) {
        this.startTimes.set(operationName, process.hrtime.bigint());
    }
    
    // End timing and record metric
    endTimer(operationName) {
        const startTime = this.startTimes.get(operationName);
        if (!startTime) {
            console.warn(`No start time found for operation: ${operationName}`);
            return 0;
        }
        
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        
        this.recordMetric(operationName, duration);
        this.startTimes.delete(operationName);
        
        return duration;
    }
    
    // Record a metric
    recordMetric(name, value) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, {
                count: 0,
                total: 0,
                min: Infinity,
                max: -Infinity,
                avg: 0
            });
        }
        
        const metric = this.metrics.get(name);
        metric.count++;
        metric.total += value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);
        metric.avg = metric.total / metric.count;
    }
    
    // Get metrics for an operation
    getMetrics(name) {
        return this.metrics.get(name) || null;
    }
    
    // Get all metrics
    getAllMetrics() {
        const result = {};
        for (const [name, metric] of this.metrics) {
            result[name] = { ...metric };
        }
        return result;
    }
    
    // Reset metrics
    reset() {
        this.metrics.clear();
        this.startTimes.clear();
    }
    
    // Log performance summary
    logSummary() {
        console.log('\n=== Performance Summary ===');
        for (const [name, metric] of this.metrics) {
            console.log(`${name}:`);
            console.log(`  Count: ${metric.count}`);
            console.log(`  Average: ${metric.avg.toFixed(2)}ms`);
            console.log(`  Min: ${metric.min.toFixed(2)}ms`);
            console.log(`  Max: ${metric.max.toFixed(2)}ms`);
            console.log(`  Total: ${metric.total.toFixed(2)}ms`);
        }
        console.log('========================\n');
    }
}

// Memory usage monitoring
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        external: Math.round(usage.external / 1024 / 1024 * 100) / 100 // MB
    };
}

// CPU usage monitoring (simplified)
function getCPUUsage() {
    const usage = process.cpuUsage();
    return {
        user: usage.user / 1000, // Convert to milliseconds
        system: usage.system / 1000
    };
}

// Batch processing utility for better performance
class BatchProcessor {
    constructor(batchSize = 5, delayBetweenBatches = 5000) {
        this.batchSize = batchSize;
        this.delayBetweenBatches = delayBetweenBatches;
    }
    
    async processBatch(items, processor, onProgress = null) {
        const results = [];
        const batches = this.createBatches(items);
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const batchResults = await this.processSingleBatch(batch, processor);
            results.push(...batchResults);
            
            if (onProgress) {
                onProgress({
                    batchIndex: i + 1,
                    totalBatches: batches.length,
                    processedItems: results.length,
                    totalItems: items.length
                });
            }
            
            // Delay between batches (except for the last one)
            if (i < batches.length - 1) {
                await this.delay(this.delayBetweenBatches + Math.random() * 1000);
            }
        }
        
        return results;
    }
    
    createBatches(items) {
        const batches = [];
        for (let i = 0; i < items.length; i += this.batchSize) {
            batches.push(items.slice(i, i + this.batchSize));
        }
        return batches;
    }
    
    async processSingleBatch(batch, processor) {
        const results = [];
        
        for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            console.log(`Processing item ${i + 1}/${batch.length}: ${item}`);
            
            try {
                const result = await processor(item);
                results.push(result);
                console.log(`Item ${item} processed successfully:`, result);
            } catch (error) {
                console.error(`Item ${item} processing failed:`, error.message);
                results.push({ success: false, item, error: error.message });
            }
            
            // Delay between items in batch (except last)
            if (i < batch.length - 1) {
                await this.delay(1000); // 1 second between items
            }
        }
        
        return results;
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Rate limiter for API calls
class RateLimiter {
    constructor(maxRequests = 100, windowMs = 60000) { // 100 requests per minute
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = new Map(); // IP -> array of timestamps
    }
    
    isAllowed(identifier) {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        
        if (!this.requests.has(identifier)) {
            this.requests.set(identifier, []);
        }
        
        const userRequests = this.requests.get(identifier);
        
        // Remove old requests outside the window
        const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
        this.requests.set(identifier, validRequests);
        
        // Check if under limit
        if (validRequests.length < this.maxRequests) {
            validRequests.push(now);
            return true;
        }
        
        return false;
    }
    
    getRemainingRequests(identifier) {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        
        if (!this.requests.has(identifier)) {
            return this.maxRequests;
        }
        
        const userRequests = this.requests.get(identifier);
        const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
        
        return Math.max(0, this.maxRequests - validRequests.length);
    }
    
    cleanup() {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        
        for (const [identifier, requests] of this.requests) {
            const validRequests = requests.filter(timestamp => timestamp > windowStart);
            if (validRequests.length === 0) {
                this.requests.delete(identifier);
            } else {
                this.requests.set(identifier, validRequests);
            }
        }
    }
}

// Global instances
const performanceMonitor = new PerformanceMonitor();
const batchProcessor = new BatchProcessor();
const rateLimiter = new RateLimiter();

// Cleanup interval for rate limiter
setInterval(() => {
    rateLimiter.cleanup();
}, 60000); // Cleanup every minute

module.exports = {
    PerformanceMonitor,
    BatchProcessor,
    RateLimiter,
    performanceMonitor,
    batchProcessor,
    rateLimiter,
    getMemoryUsage,
    getCPUUsage
};