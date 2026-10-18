package com.sendwiseforensic.supervisedkeyboard.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * EnrollmentApiService - Retrofit interface for device enrollment against
 * forensic-console.
 *
 * API CONTRACT (verified against the live route handler at
 * forensic-console/app/api/devices/enroll/route.ts — NOT the architecture
 * doc sketch, which is not byte-identical, see field-name note below):
 *
 * POST /api/devices/enroll
 *   Request:  { "code": "XXXX-XXXX", "deviceFingerprint": "<sha256>",
 *               "platform": "ANDROID", "hardwareBackedPubKey": null }
 *   Response (success, HTTP 201):
 *     { "ok": true, "data": { "deviceId": "<uuid>", "ingestToken": "<hex>" } }
 *   Response (failure, HTTP 400/409/410/500):
 *     { "ok": false, "error": "<string>" }
 *
 * This is an officer-generated, single-use, 30-minute-TTL code — the device
 * is a pure consumer here, never a producer (opposite of the old pairing
 * flow this replaces). The server deliberately returns a generic 410 for any
 * unknown/expired/already-redeemed code, so no distinction is surfaced here
 * beyond the server's own error string.
 *
 * `hardwareBackedPubKey` is optional/nullable per the server schema
 * (z.string().nullable().optional()) — Play Integrity / hardware attestation
 * is deferred per PROTOTYPE_NOTICE.md §4, so this is always sent as null for
 * now.
 */
interface EnrollmentApiService {

    @POST("/api/devices/enroll")
    suspend fun enrollDevice(
        @Body request: DeviceEnrollRequest
    ): Response<DeviceEnrollResponse>
}

/** Request body for POST /api/devices/enroll. */
data class DeviceEnrollRequest(
    val code: String,
    val deviceFingerprint: String,
    val platform: String = "ANDROID",
    val hardwareBackedPubKey: String? = null
)

/**
 * Response envelope for POST /api/devices/enroll.
 *
 * The server uses a uniform `{ ok, data, error }` envelope (confirmed
 * directly against route.ts: success responses are
 * `{ ok: true, data: { deviceId, ingestToken } }`; failures are
 * `{ ok: false, error: "<string>" }`, optionally with an `issues` array for
 * schema-validation failures which we do not need to parse here).
 */
data class DeviceEnrollResponse(
    val ok: Boolean = false,
    val data: DeviceEnrollData? = null,
    val error: String? = null
)

data class DeviceEnrollData(
    val deviceId: String? = null,
    val ingestToken: String? = null
)
