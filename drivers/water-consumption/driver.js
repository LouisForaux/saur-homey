'use strict';

const Homey = require('homey');
const SaurAPI = require('../../lib/SaurAPI');

class WaterConsumptionDriver extends Homey.Driver {
    /**
     * onInit est appelé au démarrage du driver
     */
    async onInit() {
        this.log('WaterConsumptionDriver has been initialized');
    }

    /**
     * onPair est appelé lors de l'appairage d'un nouvel appareil
     */
    async onPair(session) {
        let email = '';
        let password = '';
        let api = null;
        let sectionId = '';

        session.setHandler('login', async (data) => {
            this.log('Login attempt with email:', data.username);
            email = data.username;
            password = data.password;

            try {
                // Créer une instance de l'API et s'authentifier
                api = new SaurAPI(this.homey);
                await api.authenticate(email, password);

                // Récupérer l'ID de section
                sectionId = api.getSectionId();
                this.log('Authentication successful, sectionId:', sectionId);

                return true;
            } catch (error) {
                this.error('Login failed:', error);
                throw new Error(this.homey.__('pair.login_failed'));
            }
        });

        session.setHandler('list_devices', async () => {
            this.log('Listing devices...');

            try {
                if (!api || !sectionId) {
                    throw new Error('Not authenticated');
                }

                // Créer un appareil avec les informations de l'utilisateur
                const devices = [
                    {
                        name: this.homey.__('device.name'),
                        data: {
                            id: sectionId,
                        },
                        store: {
                            email: email,
                            password: password,
                            sectionId: sectionId
                        }
                    }
                ];

                this.log('Devices to add:', devices);
                return devices;
            } catch (error) {
                this.error('List devices failed:', error);
                throw new Error(this.homey.__('pair.list_devices_failed'));
            }
        });
    }
}

module.exports = WaterConsumptionDriver;