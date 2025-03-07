import { Sequelize } from 'sequelize';
const Op = Sequelize.Op;

const DATABASE_URI = process.env.DATABASE_URI;

const database = new Sequelize(DATABASE_URI, { logging: false, pool: { max: 30, min: 5, idle: 20 * 60 * 1000 } });

// Function to alter column size if needed
async function alterTorrentIdColumnSize() {
  try {
    // Check if the table exists
    const tableExists = await database.getQueryInterface().showAllTables()
      .then(tables => tables.includes('torrents'));
    
    if (tableExists) {
      console.log('Altering torrentId column size to 512 characters');
      // Alter the column size
      await database.query('ALTER TABLE torrents ALTER COLUMN "torrentId" TYPE VARCHAR(512)');
      console.log('Successfully altered torrentId column size');
    }
  } catch (error) {
    console.error('Error altering torrentId column size:', error.message);
  }
}

const Torrent = database.define('torrent',
    {
      infoHash: { type: Sequelize.STRING(64), primaryKey: true },
      provider: { type: Sequelize.STRING(32), allowNull: false },
      torrentId: { type: Sequelize.STRING(512) },
      title: { type: Sequelize.STRING(256), allowNull: false },
      size: { type: Sequelize.BIGINT },
      type: { type: Sequelize.STRING(16), allowNull: false },
      uploadDate: { type: Sequelize.DATE, allowNull: false },
      seeders: { type: Sequelize.SMALLINT },
      trackers: { type: Sequelize.STRING(4096) },
      languages: { type: Sequelize.STRING(4096) },
      resolution: { type: Sequelize.STRING(16) }
    }
);

const File = database.define('file',
    {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      infoHash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: { model: Torrent, key: 'infoHash' },
        onDelete: 'CASCADE'
      },
      fileIndex: { type: Sequelize.INTEGER },
      title: { type: Sequelize.STRING(256), allowNull: false },
      size: { type: Sequelize.BIGINT },
      imdbId: { type: Sequelize.STRING(32) },
      imdbSeason: { type: Sequelize.INTEGER },
      imdbEpisode: { type: Sequelize.INTEGER },
      kitsuId: { type: Sequelize.INTEGER },
      kitsuEpisode: { type: Sequelize.INTEGER }
    },
);

const Subtitle = database.define('subtitle',
    {
      infoHash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: { model: Torrent, key: 'infoHash' },
        onDelete: 'CASCADE'
      },
      fileIndex: { type: Sequelize.INTEGER, allowNull: false },
      fileId: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: File, key: 'id' },
        onDelete: 'SET NULL'
      },
      title: { type: Sequelize.STRING(512), allowNull: false },
      size: { type: Sequelize.BIGINT, allowNull: false },
    },
    { timestamps: false }
);

Torrent.hasMany(File, { foreignKey: 'infoHash', constraints: false });
File.belongsTo(Torrent, { foreignKey: 'infoHash', constraints: false });
File.hasMany(Subtitle, { foreignKey: 'fileId', constraints: false });
Subtitle.belongsTo(File, { foreignKey: 'fileId', constraints: false });

// Initialize database
export async function initDatabase() {
  try {
    await database.authenticate();
    console.log('Database connection has been established successfully.');
    
    // Sync models with database
    await database.sync();
    console.log('Database models synchronized successfully.');
    
    // Alter column size if needed
    await alterTorrentIdColumnSize();
    
    return true;
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    return false;
  }
}

// Call the initialization function
initDatabase();

export function getTorrent(infoHash) {
  return Torrent.findOne({ where: { infoHash: infoHash } });
}

export function getFiles(infoHashes) {
  return File.findAll({ where: { infoHash: { [Op.in]: infoHashes} } });
}

export function getImdbIdMovieEntries(imdbId) {
  return File.findAll({
    where: {
      imdbId: { [Op.eq]: imdbId }
    },
    include: [Torrent],
    limit: 500,
    order: [
      [Torrent, 'seeders', 'DESC']
    ]
  });
}

export function getImdbIdSeriesEntries(imdbId, season, episode) {
  return File.findAll({
    where: {
      imdbId: { [Op.eq]: imdbId },
      imdbSeason: { [Op.eq]: season },
      imdbEpisode: { [Op.eq]: episode }
    },
    include: [Torrent],
    limit: 500,
    order: [
      [Torrent, 'seeders', 'DESC']
    ]
  });
}

export function getKitsuIdMovieEntries(kitsuId) {
  return File.findAll({
    where: {
      kitsuId: { [Op.eq]: kitsuId }
    },
    include: [Torrent],
    limit: 500,
    order: [
      [Torrent, 'seeders', 'DESC']
    ]
  });
}

export function getKitsuIdSeriesEntries(kitsuId, episode) {
  return File.findAll({
    where: {
      kitsuId: { [Op.eq]: kitsuId },
      kitsuEpisode: { [Op.eq]: episode }
    },
    include: [Torrent],
    limit: 500,
    order: [
      [Torrent, 'seeders', 'DESC']
    ]
  });
}

export async function saveTorrentsAndFiles(torrents, files) {
  // Use a transaction to ensure data consistency
  const transaction = await database.transaction();
  
  try {
    // Insert torrents with upsert (update if exists)
    for (const torrent of torrents) {
      await Torrent.upsert(torrent, { transaction });
    }
    
    // Insert files with upsert (update if exists)
    for (const file of files) {
      // For files, we need to check if a file with the same infoHash and fileIndex exists
      const existingFile = await File.findOne({
        where: {
          infoHash: file.infoHash,
          fileIndex: file.fileIndex
        },
        transaction
      });
      
      if (existingFile) {
        // Update existing file
        await existingFile.update(file, { transaction });
      } else {
        // Create new file
        await File.create(file, { transaction });
      }
    }
    
    // Commit the transaction
    await transaction.commit();
    return true;
  } catch (error) {
    // Rollback the transaction in case of error
    await transaction.rollback();
    console.error('Error saving torrents and files:', error);
    throw error;
  }
}
