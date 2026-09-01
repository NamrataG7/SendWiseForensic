package com.sendwiseforensic.supervisedkeyboard.evidence

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import com.sendwiseforensic.supervisedkeyboard.authorization.DataCategory
import java.time.Instant

/**
 * Local Room-backed spool of pending [EvidenceRow]s awaiting upload by
 * [EvidenceUploader].
 *
 * Only [EvidenceRecorder] is allowed to call [EvidenceDao.insert] — the
 * DAO is annotated `// COLLECTION_GATE_ONLY` to enforce the invariant at
 * review time. Room itself does not know about
 * [com.sendwiseforensic.supervisedkeyboard.authorization.CollectionGate];
 * the discipline is upstream.
 */
@Entity(tableName = "evidence")
data class EvidenceRow(
    @PrimaryKey val batchId: String,
    @ColumnInfo(name = "session_id") val sessionId: String,
    @ColumnInfo(name = "captured_at") val capturedAt: Instant,
    @ColumnInfo(name = "category") val category: DataCategory,
    @ColumnInfo(name = "payload") val payloadBytes: ByteArray,
    @ColumnInfo(name = "prev_batch_hash_hex") val prevBatchHashHex: String,
    @ColumnInfo(name = "batch_hash_hex") val batchHashHex: String,
    @ColumnInfo(name = "privilege_flag") val privilegeFlag: PrivilegeFlag,
    @ColumnInfo(name = "context_app_package") val contextAppPackage: String?,
    @ColumnInfo(name = "signature_b64") val signatureBase64: String,
    @ColumnInfo(name = "attempt_count") val attemptCount: Int = 0,
    @ColumnInfo(name = "last_upload_error") val lastUploadError: String? = null,
    @ColumnInfo(name = "uploaded") val uploaded: Boolean = false,
    @ColumnInfo(name = "dead_lettered") val deadLettered: Boolean = false,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is EvidenceRow) return false
        return batchId == other.batchId
    }
    override fun hashCode(): Int = batchId.hashCode()
}

@Dao
interface EvidenceDao {
    // COLLECTION_GATE_ONLY — call this only from EvidenceRecorder, which
    // has already consulted CollectionGate.canCollect().
    @Insert
    suspend fun insert(row: EvidenceRow)

    @Query(
        """
        SELECT * FROM evidence
        WHERE uploaded = 0 AND dead_lettered = 0
        ORDER BY captured_at ASC
        LIMIT :limit
        """
    )
    suspend fun pendingBatches(limit: Int): List<EvidenceRow>

    @Query("UPDATE evidence SET uploaded = 1 WHERE batchId = :id")
    suspend fun markUploaded(id: String)

    @Query(
        """
        UPDATE evidence
        SET attempt_count = attempt_count + 1, last_upload_error = :error
        WHERE batchId = :id
        """
    )
    suspend fun bumpAttempt(id: String, error: String)

    @Query(
        """
        UPDATE evidence
        SET dead_lettered = 1, last_upload_error = :error
        WHERE batchId = :id
        """
    )
    suspend fun markDeadLettered(id: String, error: String)

    @Query("SELECT COUNT(*) FROM evidence WHERE uploaded = 0 AND dead_lettered = 0")
    suspend fun pendingCount(): Int
}

class EvidenceConverters {
    @TypeConverter
    fun instantToLong(i: Instant?): Long? = i?.toEpochMilli()

    @TypeConverter
    fun longToInstant(l: Long?): Instant? = l?.let { Instant.ofEpochMilli(it) }

    @TypeConverter
    fun categoryToString(c: DataCategory?): String? = c?.name

    @TypeConverter
    fun stringToCategory(s: String?): DataCategory? = s?.let { DataCategory.valueOf(it) }

    @TypeConverter
    fun privilegeToString(p: PrivilegeFlag?): String? = p?.name

    @TypeConverter
    fun stringToPrivilege(s: String?): PrivilegeFlag? = s?.let { PrivilegeFlag.valueOf(it) }

    // NOTE: no ByteArray converters — Room maps ByteArray to BLOB natively and
    // KSP rejects identity converters as "Multiple methods define the same conversion".
}

@Database(
    entities = [EvidenceRow::class],
    version = 1,
    exportSchema = false,
)
@TypeConverters(EvidenceConverters::class)
abstract class EvidenceDatabase : RoomDatabase() {
    abstract fun evidenceDao(): EvidenceDao
}

/**
 * Process-wide singleton accessor. Built lazily on first access.
 */
object EvidenceStore {
    @Volatile private var db: EvidenceDatabase? = null

    fun get(context: Context): EvidenceDatabase {
        val existing = db
        if (existing != null) return existing
        synchronized(this) {
            val e2 = db
            if (e2 != null) return e2
            val fresh = Room.databaseBuilder(
                context.applicationContext,
                EvidenceDatabase::class.java,
                "sendwise_evidence.db",
            )
                // Destructive migration is acceptable in the prototype; the
                // spool is a cache of pending uploads, not primary evidence.
                // TODO(WIRE-TO-FORENSIC-CONSOLE) real migrations must
                // preserve un-uploaded batches across app updates.
                .fallbackToDestructiveMigration()
                .build()
            db = fresh
            return fresh
        }
    }
}
