const fs = require('fs');
const path = require('path');

class Database {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.contactsFile = path.join(this.dataDir, 'contacts.json');
        this.campaignsFile = path.join(this.dataDir, 'campaigns.json');
        this.reportsFile = path.join(this.dataDir, 'reports.json');
        
        this.ensureDataDir();
        this.initializeFiles();
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    initializeFiles() {
        if (!fs.existsSync(this.contactsFile)) {
            fs.writeFileSync(this.contactsFile, JSON.stringify([]));
        }
        if (!fs.existsSync(this.campaignsFile)) {
            fs.writeFileSync(this.campaignsFile, JSON.stringify([]));
        }
        if (!fs.existsSync(this.reportsFile)) {
            fs.writeFileSync(this.reportsFile, JSON.stringify([]));
        }
    }

    // Contacts management
    getContacts() {
        try {
            const data = fs.readFileSync(this.contactsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    saveContacts(contacts) {
        const existingContacts = this.getContacts();
        const contactMap = new Map();
        
        // Add existing contacts
        existingContacts.forEach(contact => {
            contactMap.set(contact.number, contact);
        });
        
        // Add new contacts
        contacts.forEach(contact => {
            contactMap.set(contact.number, {
                ...contact,
                addedAt: contact.addedAt || new Date().toISOString()
            });
        });
        
        const allContacts = Array.from(contactMap.values());
        fs.writeFileSync(this.contactsFile, JSON.stringify(allContacts, null, 2));
        return allContacts;
    }

    deleteContact(number) {
        const contacts = this.getContacts();
        const filtered = contacts.filter(c => c.number !== number);
        fs.writeFileSync(this.contactsFile, JSON.stringify(filtered, null, 2));
        return filtered;
    }

    // Campaigns management
    getCampaigns() {
        try {
            const data = fs.readFileSync(this.campaignsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    saveCampaign(campaign) {
        const campaigns = this.getCampaigns();
        campaigns.push({
            ...campaign,
            id: `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date().toISOString()
        });
        fs.writeFileSync(this.campaignsFile, JSON.stringify(campaigns, null, 2));
        return campaigns[campaigns.length - 1];
    }

    updateCampaign(id, updates) {
        const campaigns = this.getCampaigns();
        const index = campaigns.findIndex(c => c.id === id);
        if (index !== -1) {
            campaigns[index] = { ...campaigns[index], ...updates };
            fs.writeFileSync(this.campaignsFile, JSON.stringify(campaigns, null, 2));
            return campaigns[index];
        }
        return null;
    }

    // Reports management
    getReports() {
        try {
            const data = fs.readFileSync(this.reportsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    saveReport(report) {
        const reports = this.getReports();
        reports.push({
            ...report,
            id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date().toISOString()
        });
        fs.writeFileSync(this.reportsFile, JSON.stringify(reports, null, 2));
        return reports[reports.length - 1];
    }

    getReportsByDate(date) {
        const reports = this.getReports();
        const targetDate = new Date(date).toDateString();
        return reports.filter(report => {
            const reportDate = new Date(report.createdAt).toDateString();
            return reportDate === targetDate;
        });
    }

    getReportsByCampaign(campaignId) {
        const reports = this.getReports();
        return reports.filter(report => report.campaignId === campaignId);
    }
}

module.exports = new Database();