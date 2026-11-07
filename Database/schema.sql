-- ============================================================================
-- schema.sql  -  SQL Server tables for ChatAccountant.Api
-- ----------------------------------------------------------------------------
-- OPTIONAL. The API creates these tables itself on start (Database:AutoCreate = true).
-- Use this script if you prefer to create the database by hand / in production.
-- If you run it, set  "Database": { "AutoCreate": false }  and manage changes with
-- EF migrations or your own scripts. Safe to re-run (only creates what is missing).
-- ============================================================================
IF DB_ID(N'ChatAccountant') IS NULL CREATE DATABASE ChatAccountant;
GO
USE ChatAccountant;
GO

IF OBJECT_ID(N'dbo.Users') IS NULL
CREATE TABLE dbo.Users (
    Id             uniqueidentifier NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    GoogleSubject  nvarchar(100)  NOT NULL,
    Email          nvarchar(320)  NOT NULL,
    Name           nvarchar(200)  NOT NULL,
    GivenName      nvarchar(100)  NOT NULL,
    FamilyName     nvarchar(100)  NOT NULL,
    Picture        nvarchar(1000) NULL,
    EmailVerified  bit            NOT NULL,
    Locale         nvarchar(20)   NULL,
    Phone          nvarchar(20)   NULL,          -- verified mobile, E.164 (+919876543210)
    CreatedAt      datetime2      NOT NULL,
    LastSignInAt   datetime2      NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_GoogleSubject')
    CREATE UNIQUE INDEX IX_Users_GoogleSubject ON dbo.Users (GoogleSubject);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_Phone')
    CREATE UNIQUE INDEX IX_Users_Phone ON dbo.Users (Phone) WHERE Phone IS NOT NULL;   -- a number belongs to one account

IF OBJECT_ID(N'dbo.UserConfigs') IS NULL
CREATE TABLE dbo.UserConfigs (
    UserId      uniqueidentifier NOT NULL CONSTRAINT PK_UserConfigs PRIMARY KEY
                CONSTRAINT FK_UserConfigs_Users FOREIGN KEY REFERENCES dbo.Users (Id) ON DELETE CASCADE,
    ConfigJson  nvarchar(max)    NOT NULL CONSTRAINT CK_UserConfigs_Json CHECK (ISJSON(ConfigJson) = 1),
    UpdatedAt   datetime2        NOT NULL
);

IF OBJECT_ID(N'dbo.LedgerEntries') IS NULL
CREATE TABLE dbo.LedgerEntries (
    Id            uniqueidentifier NOT NULL CONSTRAINT PK_LedgerEntries PRIMARY KEY,
    Seq           bigint IDENTITY(1,1) NOT NULL,               -- keeps insertion order
    UserId        uniqueidentifier NOT NULL
                  CONSTRAINT FK_LedgerEntries_Users FOREIGN KEY REFERENCES dbo.Users (Id) ON DELETE CASCADE,
    EntryDate     date          NOT NULL,
    Type          nvarchar(10)  NOT NULL CONSTRAINT CK_LedgerEntries_Type CHECK (Type IN (N'income', N'expense')),
    Category      nvarchar(200) NOT NULL,
    Account       nvarchar(200) NOT NULL,
    Description   nvarchar(1000) NOT NULL,
    Amount        decimal(14,2) NOT NULL,
    Party         nvarchar(200) NULL,
    TaxableAmount decimal(14,2) NULL,                          -- GST fields: only on Sale / Purchase entries
    GstPercent    decimal(6,3)  NULL,
    GstAmount     decimal(14,2) NULL,
    TaxSplitJson  nvarchar(max) NULL,                          -- {type:"CGST_SGST"|"IGST", ...}
    ExtraJson     nvarchar(max) NULL,                          -- any field the app adds later
    ShareId       nvarchar(64)  NULL,                          -- request that created this entry (prevents double booking)
    CreatedAt     datetime2     NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LedgerEntries_UserId_Seq')
    CREATE INDEX IX_LedgerEntries_UserId_Seq ON dbo.LedgerEntries (UserId, Seq);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LedgerEntries_UserId_ShareId')
    CREATE UNIQUE INDEX IX_LedgerEntries_UserId_ShareId ON dbo.LedgerEntries (UserId, ShareId) WHERE ShareId IS NOT NULL;

IF OBJECT_ID(N'dbo.Shares') IS NULL
CREATE TABLE dbo.Shares (
    Id          uniqueidentifier NOT NULL CONSTRAINT PK_Shares PRIMARY KEY,
    FromUserId  uniqueidentifier NOT NULL
                CONSTRAINT FK_Shares_Users FOREIGN KEY REFERENCES dbo.Users (Id) ON DELETE CASCADE,
    FromPhone   nvarchar(20)  NOT NULL,
    ToPhone     nvarchar(20)  NOT NULL,
    Kind        nvarchar(30)  NOT NULL
                CONSTRAINT CK_Shares_Kind CHECK (Kind IN (N'sale', N'purchase', N'received', N'paid', N'discount_allowed', N'discount_received')),
    Status      nvarchar(10)  NOT NULL CONSTRAINT CK_Shares_Status CHECK (Status IN (N'pending', N'accepted', N'rejected')),
    PayloadJson nvarchar(max) NOT NULL CONSTRAINT CK_Shares_Payload CHECK (ISJSON(PayloadJson) = 1 AND LEN(PayloadJson) < 16000),
    NotifiedAt  datetime2     NULL,
    CreatedAt   datetime2     NOT NULL,
    RespondedAt datetime2     NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Shares_ToPhone_Status')
    CREATE INDEX IX_Shares_ToPhone_Status ON dbo.Shares (ToPhone, Status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Shares_FromUserId_CreatedAt')
    CREATE INDEX IX_Shares_FromUserId_CreatedAt ON dbo.Shares (FromUserId, CreatedAt);

IF OBJECT_ID(N'dbo.PhoneOtps') IS NULL
CREATE TABLE dbo.PhoneOtps (
    Id         uniqueidentifier NOT NULL CONSTRAINT PK_PhoneOtps PRIMARY KEY,
    UserId     uniqueidentifier NOT NULL
               CONSTRAINT FK_PhoneOtps_Users FOREIGN KEY REFERENCES dbo.Users (Id) ON DELETE CASCADE,
    Phone      nvarchar(20)  NOT NULL,
    CodeHash   nvarchar(100) NOT NULL,
    Attempts   int           NOT NULL,
    Used       bit           NOT NULL,
    ExpiresAt  datetime2     NOT NULL,
    CreatedAt  datetime2     NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PhoneOtps_UserId_CreatedAt')
    CREATE INDEX IX_PhoneOtps_UserId_CreatedAt ON dbo.PhoneOtps (UserId, CreatedAt);
GO
