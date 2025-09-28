const axios = require('axios');

class SarvamAI {
    constructor() {
        this.apiKey = 'sk_hip7jifo_zL6RmfOtifuS6UY6B2XRABT6';  // your subscription key
        this.baseURL = 'https://api.sarvam.ai/v1/chat/completions';  // correct path per docs
    }

async generateCampaignMessage(language, prompt) {
    try {
        const response = await axios.post(this.baseURL, {
            model: 'sarvam-m',
            messages: [
                {
                    role: 'system',
                    content: `You are a *professional marketing expert and campaign writer*.
Your task is to create *long-form WhatsApp marketing campaigns* in ${language}.
The campaign must feel persuasive, customer-centric, and professionally structured.

Follow these rules:
- Start with a strong attention-grabbing hook (headline).
- Clearly explain the offer/event/announcement with benefits and value.
- Add persuasive details (why the reader should act).
- Use WhatsApp formatting: *bold*, _italic_, ~strikethrough~ where appropriate.
- Use emojis naturally to improve engagement (not overused).
- Always include a *call-to-action* (CTA) at the end.
- Make it at least 5–8 sentences long, written like a mini-campaign message, not just a short blurb.`
                },
                {
                    role: 'user',
                    content: `Write a professional WhatsApp campaign in ${language} for: ${prompt}`
                }
            ],
            max_tokens: 600,
            temperature: 0.8
        }, {
            headers: {
                'api-subscription-key': this.apiKey,
                'Content-Type': 'application/json'
            }
        });

        return {
            success: true,
            message: response.data.choices[0].message.content.trim(),
            language
        };
    } catch (error) {
        console.error('Sarvam AI Error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message,
            fallbackMessage: this.getFallbackMessage(language, prompt)
        };
    }
}


    getFallbackMessage(language, prompt) {
        const isPromotion = /discount|offer|sale/i.test(prompt);
        const isEvent = /event|party|invitation/i.test(prompt);
        const isAnnouncement = /new|launch|opening/i.test(prompt);

        let template;
        if (isPromotion) {
            template = {
                'English': `🎉 *Special Offer!*\n\n${prompt}\n\n_Don't miss out!_ ⏰`,
                'Hindi': `🎉 *विशेष ऑफर!*\n\n${prompt}\n\n_छूटने न दें!_ ⏰`,
                'Spanish': `🎉 *¡Oferta Especial!*\n\n${prompt}\n\n_¡No te lo pierdas!_ ⏰`
            };
        } else if (isEvent) {
            template = {
                'English': `🎊 *You're Invited!*\n\n${prompt}\n\n_Hope to see you there!_ 🎈`,
                'Hindi': `🎊 *आपको आमंत्रित है!*\n\n${prompt}\n\n_आपको वहां देखने की उम्मीद है!_ 🎈`,
                'Spanish': `🎊 *¡Estás Invitado!*\n\n${prompt}\n\n_¡Esperamos verte allí!_ 🎈`
            };
        } else if (isAnnouncement) {
            template = {
                'English': `📢 *Exciting News!*\n\n${prompt}\n\n_Stay tuned for more updates!_ ✨`,
                'Hindi': `📢 *रोमांचक समाचार!*\n\n${prompt}\n\n_अधिक अपडेट के लिए बने रहें!_ ✨`,
                'Spanish': `📢 *¡Noticias Emocionantes!*\n\n${prompt}\n\n_¡Mantente atento a más actualizaciones!_ ✨`
            };
        } else {
            template = {
                'English': `💬 *Message for You*\n\n${prompt}\n\n_Thank you for your time!_ 🙏`,
                'Hindi': `💬 *आपके लिए संदेश*\n\n${prompt}\n\n_आपके समय के लिए धन्यवाद!_ 🙏`,
                'Spanish': `💬 *Mensaje para Ti*\n\n${prompt}\n\n_¡Gracias por tu tiempo!_ 🙏`
            };
        }

        return template[language] || template['English'];
    }

    getSupportedLanguages() {
        return [
            { code: 'en', name: 'English' },
            { code: 'hi', name: 'Hindi' },
            { code: 'es', name: 'Spanish' }
        ];
    }
}

module.exports = new SarvamAI();
