const accessToken = "eyJ0eXAiOiJKV1QiLCJub25jZSI6IjZsamdURXhnelBpZ19WYy1OMmtKWGRsNi0zVjBDOWw1eUhLdVFId0l5dTAiLCJhbGciOiJSUzI1NiIsIng1dCI6InNNMV95QXhWOEdWNHlOLUI2ajJ4em1pazVBbyIsImtpZCI6InNNMV95QXhWOEdWNHlOLUI2ajJ4em1pazVBbyJ9.eyJhdWQiOiJodHRwczovL2dyYXBoLm1pY3Jvc29mdC5jb20iLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC8zOGZiZGYxYi0zNDU1LTQxODUtOWU0Yy05MmE3OTU1OGZhZWYvIiwiaWF0IjoxNzczMDQ5NjIxLCJuYmYiOjE3NzMwNDk2MjEsImV4cCI6MTc3MzA1MzUyMSwiYWlvIjoiazJaZ1lERFYxdWRjOVVPdy9wUHBvOVNYc3JibkFRPT0iLCJhcHBfZGlzcGxheW5hbWUiOiJGYWN0b3J5IFR3aW4iLCJhcHBpZCI6ImY5MTQyOWM4LTZjOTMtNDNjZS05YjViLTFmNDE3YjE5ZWZhNyIsImFwcGlkYWNyIjoiMSIsImlkcCI6Imh0dHBzOi8vc3RzLndpbmRvd3MubmV0LzM4ZmJkZjFiLTM0NTUtNDE4NS05ZTRjLTkyYTc5NTU4ZmFlZi8iLCJpZHR5cCI6ImFwcCIsIm9pZCI6IjAzNzhjYmMyLTgyYjUtNDc1NC04OWZjLTQzNTI3ZTljMjQwNiIsInJoIjoiMS5BY1lBRzlfN09GVTBoVUdlVEpLbmxWajY3d01BQUFBQUFBQUF3QUFBQUFBQUFBQUFBQURHQUEuIiwicm9sZXMiOlsiRmlsZXMuUmVhZC5BbGwiXSwic3ViIjoiMDM3OGNiYzItODJiNS00NzU0LTg5ZmMtNDM1MjdlOWMyNDA2IiwidGVuYW50X3JlZ2lvbl9zY29wZSI6IkFTIiwidGlkIjoiMzhmYmRmMWItMzQ1NS00MTg1LTllNGMtOTJhNzk1NThmYWVmIiwidXRpIjoiMGNzZUxqbFJNMEs2ZGZHV2ktaG1BQSIsInZlciI6IjEuMCIsIndpZHMiOlsiMDk5N2ExZDAtMGQxZC00YWNiLWI0MDgtZDVjYTczMTIxZTkwIl0sInhtc19hY2QiOjE3NzMwNDMwNTMsInhtc19hY3RfZmN0IjoiMyA5IiwieG1zX2Z0ZCI6InpQN0paN25QQnR6NVBtNGdwX0twR2phZ2dFTWtNQWNGRDM3YjFHdUtVMUlCYTI5eVpXRmpaVzUwY21Gc0xXUnpiWE0iLCJ4bXNfaWRyZWwiOiIxMCA3IiwieG1zX3JkIjoiMC40MkxqWUJKaU9zWW9KTUxCTGlTZ3MyYnAxMU54RVM0YmpzM2EyMjNkc3hzb3lpa2swSHBXVF9XWjVqR3ZKVS1OVDY2WVpIY1lLTW9oSk1ETUFBRUhvRFJRbEZ0SVlFTFo3U1dmZFp0bmFPYjV4bnpLV2lBREFBIiwieG1zX3N1Yl9mY3QiOiIzIDkiLCJ4bXNfdGNkdCI6MTczNTc2NzMzOSwieG1zX3RudF9mY3QiOiIzIDE0In0.ZOsdJTlc3Idsmkyxc-bFmR4hHFZxlSo9v5-x-M07xYi1PmpErMhu8vu9Icj_HvdBotCvzIJohfu5t-bopCZtLT8oflw48WTMCqdrHDgpen-k56Cjkenv-0fZ1_s8VYUGHqkvRArsJRXpmR_hvrDqpd_D1384i0kZXzgKI02Qk_ZCZCZlnP_Q8VMdzofais5t9r62IE31q8fhej2DnqrL3f8twRth9EkLsNfaK5_opNQX9oAVeyEKSnDXKhBQW3WhvnBQuZ0_mgTYLSpk3vaLkXlYu5R2a4lMpDsjxO43GshHVcvNhg3JalQp4cqz5wKaXstGWD6keOOhIRxQ1YkPUQ";
const userId = "0378cbc2-82b5-4754-89fc-43527e9c2406";

async function listRootContents() {
    const url = `https://graph.microsoft.com/v1.0/users/${userId}/drive/root/children`;
    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await res.json();
        console.log("Root Items:");
        if (data.value) {
            data.value.forEach(item => {
                console.log(`- ${item.name} (ID: ${item.id}, Folder: ${!!item.folder})`);
            });
        } else {
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("Failed to list items:", error);
    }
}

listRootContents();
