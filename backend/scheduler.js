const cron = require('node-cron');

class CampaignScheduler {
    constructor() {
        this.scheduledJobs = new Map();
    }

    scheduleCampaign(campaignId, scheduledTime, callback) {
        const scheduleDate = new Date(scheduledTime);
        const now = new Date();
        
        if (scheduleDate <= now) {
            throw new Error('Scheduled time must be in the future');
        }

        // Convert to cron format
        const cronExpression = this.dateToCron(scheduleDate);
        
        const task = cron.schedule(cronExpression, () => {
            console.log(`Executing scheduled campaign: ${campaignId}`);
            callback();
            this.scheduledJobs.delete(campaignId);
        }, {
            scheduled: false
        });

        this.scheduledJobs.set(campaignId, {
            task,
            scheduledTime,
            cronExpression
        });

        task.start();
        
        console.log(`Campaign ${campaignId} scheduled for ${scheduleDate.toISOString()}`);
        return { campaignId, scheduledTime, cronExpression };
    }

    cancelScheduledCampaign(campaignId) {
        const job = this.scheduledJobs.get(campaignId);
        if (job) {
            job.task.stop();
            this.scheduledJobs.delete(campaignId);
            console.log(`Cancelled scheduled campaign: ${campaignId}`);
            return true;
        }
        return false;
    }

    getScheduledCampaigns() {
        const campaigns = [];
        for (const [campaignId, job] of this.scheduledJobs) {
            campaigns.push({
                campaignId,
                scheduledTime: job.scheduledTime,
                cronExpression: job.cronExpression
            });
        }
        return campaigns;
    }

    dateToCron(date) {
        const minute = date.getMinutes();
        const hour = date.getHours();
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        
        return `${minute} ${hour} ${day} ${month} *`;
    }
}

module.exports = new CampaignScheduler();