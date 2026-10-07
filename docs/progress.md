# Project Progress

## API Management Setup

We have successfully configured the foundational API Management and Deployment settings for the MediFind project:

- **Dev/Prod Configs**: Established separate environment configurations for Development and Production to isolate testing from live data.
- **Auto-Deploy**: Configured continuous deployment so that pushes to the `main` branch automatically build and deploy the latest changes to Choreo.
- **Scale to Zero**: Enabled serverless scale-to-zero settings in Choreo to minimize resource consumption and costs when the API is idle.
- **OAuth2 & Permissions**: Integrated Asgardeo OAuth2 security to protect the API endpoints. Configured strict permissions ensuring that only authorized clients can access protected routes.
- **CORS & Rate Limiting**: Enabled Cross-Origin Resource Sharing (CORS) to allow the frontend to communicate with the API. Applied rate limiting policies to prevent abuse and ensure high availability.
- **Publishing & Devportal**: Published the Inventory API to the Developer Portal, making it discoverable and ready for consumption.
- **Devportal App & Subscription**: Created an application in the Devportal and subscribed it to the Inventory API to generate the necessary access tokens and credentials for secure consumption.
