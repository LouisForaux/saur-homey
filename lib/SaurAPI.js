'use strict';

const fetch = require('node-fetch');

const AUTH_URL = 'https://apib2c.azure.saurclient.fr/admin/auth';
const CONSUMPTION_URL = 'https://apib2c.azure.saurclient.fr/deli/section_subscription/{sectionId}/consumptions/weekly?year={year}&month={month}&day={day}';

class SaurAPI {
    constructor(homey) {
        this.homey = homey;
        this.accessToken = null;
        this.sectionId = null;
        this.tokenExpiration = null;
    }

    /**
     * S'authentifier auprès de l'API SAUR
     * @param {string} email - Email de l'utilisateur
     * @param {string} password - Mot de passe de l'utilisateur
     */
    async authenticate(email, password) {
        try {
            const payload = {
                username: email,
                password: password,
                client_id: 'frontjs-client',
                grant_type: 'password',
                scope: 'api-scope',
                isRecaptchaV3: true,
                captchaToken: true
            };

            const response = await fetch(AUTH_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            this.accessToken = data.token.access_token;
            this.sectionId = data.defaultSectionId;

            const expiresIn = parseInt(data.token.expires_in, 10);
            this.tokenExpiration = new Date(Date.now() + expiresIn * 1000);

            this.homey.log(`Authenticated successfully. Token expires at ${this.tokenExpiration}`);

            return true;
        } catch (error) {
            this.homey.error('Authentication error:', error);
            throw error;
        }
    }

    /**
     * Vérifier si le token est expiré
     * @returns {boolean} - True si le token est expiré
     */
    isTokenExpired() {
        if (!this.accessToken || !this.tokenExpiration) {
            return true;
        }
        return Date.now() >= this.tokenExpiration.getTime();
    }

    /**
     * Obtenir l'ID de section
     * @returns {string} - ID de section
     */
    getSectionId() {
        return this.sectionId;
    }

    /**
     * Récupérer les données de consommation
     * @param {string} sectionId - ID de section
     * @param {Date} date - Date pour laquelle récupérer les données
     * @returns {Object|null} - Données de consommation ou null
     */
    async getConsumption(sectionId, date) {
        try {
            // Vérifier et renouveler le token si nécessaire
            if (this.isTokenExpired()) {
                throw new Error('Token expired. Please re-authenticate.');
            }

            const url = CONSUMPTION_URL
                .replace('{sectionId}', sectionId)
                .replace('{year}', date.getFullYear())
                .replace('{month}', date.getMonth() + 1)
                .replace('{day}', date.getDate());

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized. Token may have expired.');
                }
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (data.consumptions && data.consumptions.length > 0) {
                return data.consumptions[0];
            }

            return null;
        } catch (error) {
            this.homey.error('Failed to fetch consumption data:', error);
            throw error;
        }
    }
}

module.exports = SaurAPI;