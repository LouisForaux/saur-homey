'use strict';

const Homey = require('homey');
const SaurAPI = require('../../lib/SaurAPI');

class WaterConsumptionDevice extends Homey.Device {
    /**
     * onInit est appelé au démarrage de l'appareil
     */
    async onInit() {
        this.log('WaterConsumptionDevice has been initialized');

        // Récupérer les données stockées
        const store = this.getStore();
        const email = store.email;
        const password = store.password;
        const sectionId = store.sectionId;

        // Initialiser l'API
        this.api = new SaurAPI(this.homey);

        try {
            await this.api.authenticate(email, password);
        } catch (error) {
            this.error('Authentication failed:', error);
            this.setUnavailable(this.homey.__('device.auth_failed'));
            return;
        }

        // Première mise à jour des données
        await this.updateConsumption();

        // Planifier les mises à jour toutes les 15 minutes
        this.updateInterval = setInterval(async () => {
            await this.updateConsumption();
        }, 15 * 60 * 1000); // 15 minutes

        this.log('Device initialized successfully');
    }

    /**
     * onAdded est appelé lorsque l'utilisateur ajoute l'appareil
     */
    async onAdded() {
        this.log('WaterConsumptionDevice has been added');
    }

    /**
     * onSettings est appelé lorsque l'utilisateur met à jour les paramètres
     */
    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('WaterConsumptionDevice settings were changed');

        // Si l'email ou le mot de passe a changé, ré-authentifier
        if (changedKeys.includes('email') || changedKeys.includes('password')) {
            try {
                await this.api.authenticate(newSettings.email, newSettings.password);

                // Mettre à jour le store
                await this.setStoreValue('email', newSettings.email);
                await this.setStoreValue('password', newSettings.password);

                // Mettre à jour immédiatement les données
                await this.updateConsumption();

                this.setAvailable();
            } catch (error) {
                this.error('Re-authentication failed:', error);
                this.setUnavailable(this.homey.__('device.auth_failed'));
                throw new Error(this.homey.__('device.auth_failed'));
            }
        }
    }

    /**
     * onRenamed est appelé lorsque l'utilisateur renomme l'appareil
     */
    async onRenamed(name) {
        this.log('WaterConsumptionDevice was renamed to', name);
    }

    /**
     * onDeleted est appelé lorsque l'utilisateur supprime l'appareil
     */
    async onDeleted() {
        this.log('WaterConsumptionDevice has been deleted');

        // Arrêter l'intervalle de mise à jour
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }

    /**
     * Mettre à jour les données de consommation
     */
    async updateConsumption() {
        try {
            const sectionId = this.getStoreValue('sectionId');
            const now = new Date();

            // Essayer d'obtenir les données pour aujourd'hui
            let data = await this.api.getConsumption(sectionId, now);

            // Si pas de données, essayer hier
            if (!data) {
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                data = await this.api.getConsumption(sectionId, yesterday);
            }

            // Si toujours pas de données, essayer les 7 derniers jours
            if (!data) {
                for (let i = 2; i < 8; i++) {
                    const pastDate = new Date(now);
                    pastDate.setDate(pastDate.getDate() - i);
                    data = await this.api.getConsumption(sectionId, pastDate);
                    if (data) break;
                }
            }

            if (data) {
                // Mettre à jour les capabilities
                const value = Math.abs(data.value || 0);

                if (this.hasCapability('measure_water')) {
                    await this.setCapabilityValue('measure_water', value);
                }

                if (this.hasCapability('meter_water')) {
                    await this.setCapabilityValue('meter_water', value);
                }

                // Mettre à jour les attributs (settings)
                await this.setSettings({
                    last_period: data.startDate || '',
                    current_period: data.endDate || ''
                });

                this.setAvailable();
                this.log('Consumption updated:', value, 'm³');
            } else {
                this.log('No consumption data available for the last 7 days');
            }
        } catch (error) {
            this.error('Failed to update consumption:', error);

            // Si l'erreur est liée à l'authentification, marquer comme non disponible
            if (error.message && error.message.includes('401')) {
                this.setUnavailable(this.homey.__('device.auth_failed'));
            }
        }
    }
}

module.exports = WaterConsumptionDevice;