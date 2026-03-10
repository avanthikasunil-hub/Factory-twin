const tenantId = "38fbdf1b-3455-4185-9e4c-92a79558faef";
const clientId = "f91429c8-6c93-43ce-9b5b-1f417b19efa7";
const clientSecret = "8a58Q~ByjwNksW0-L65dNH0CbklpJoM9zgmthbcU";

async function getAccessToken() {
    try {
        const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                scope: "https://graph.microsoft.com/.default",
                grant_type: "client_credentials"
            })
        });

        const data = await response.json();
        if (data.access_token) {
            console.log(data.access_token);
        } else {
            console.error("Error response from Microsoft:", data);
        }
    } catch (error) {
        console.error("Network or parsing error:", error);
    }
}

getAccessToken();
