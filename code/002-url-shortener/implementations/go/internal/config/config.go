package config

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strconv"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

type Config struct {
	ListenAddress string
	BaseURL       string
	DatabaseURL   string
	PoolMax       int32
	AutoMigrate   bool
}

type databaseSecret struct {
	ConnectionString string      `json:"connectionString"`
	Host             string      `json:"host"`
	Port             interface{} `json:"port"`
	Username         string      `json:"username"`
	Password         string      `json:"password"`
	DBName           string      `json:"dbname"`
	Database         string      `json:"database"`
}

func Load(ctx context.Context) (Config, error) {
	databaseURL, err := resolveDatabaseURL(ctx)
	if err != nil {
		return Config{}, err
	}

	poolMax := int32(20)
	if value := os.Getenv("PG_POOL_MAX"); value != "" {
		parsed, parseErr := strconv.ParseInt(value, 10, 32)
		if parseErr != nil || parsed < 1 {
			return Config{}, fmt.Errorf("invalid PG_POOL_MAX %q", value)
		}
		poolMax = int32(parsed)
	}

	autoMigrate := true
	if value := os.Getenv("DB_AUTO_MIGRATE"); value != "" {
		autoMigrate, err = strconv.ParseBool(value)
		if err != nil {
			return Config{}, fmt.Errorf("invalid DB_AUTO_MIGRATE %q", value)
		}
	}

	return Config{
		ListenAddress: ":" + envOr("PORT", "3000"),
		BaseURL:       envOr("BASE_URL", "http://localhost:3000"),
		DatabaseURL:   databaseURL,
		PoolMax:       poolMax,
		AutoMigrate:   autoMigrate,
	}, nil
}

func resolveDatabaseURL(ctx context.Context) (string, error) {
	if value := os.Getenv("DATABASE_URL"); value != "" {
		return value, nil
	}

	secretARN := os.Getenv("DATABASE_SECRET_ARN")
	if secretARN == "" {
		return "postgres://url_shortener:url_shortener@localhost:5432/url_shortener", nil
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return "", fmt.Errorf("load AWS config: %w", err)
	}
	secret, err := secretsmanager.NewFromConfig(awsCfg).GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{SecretId: &secretARN})
	if err != nil {
		return "", fmt.Errorf("read database secret: %w", err)
	}
	if secret.SecretString == nil {
		return "", fmt.Errorf("database secret %s has no SecretString", secretARN)
	}

	var value databaseSecret
	if err := jsonUnmarshal([]byte(*secret.SecretString), &value); err != nil {
		return "", fmt.Errorf("parse database secret: %w", err)
	}
	if value.ConnectionString != "" {
		return value.ConnectionString, nil
	}
	if value.Host == "" || value.Username == "" || value.Password == "" {
		return "", fmt.Errorf("database secret must contain connectionString or host, username and password")
	}
	databaseName := value.Database
	if databaseName == "" {
		databaseName = value.DBName
	}
	if databaseName == "" {
		return "", fmt.Errorf("database secret must contain database or dbname")
	}
	port := "5432"
	if value.Port != nil {
		port = fmt.Sprint(value.Port)
	}

	return (&url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(value.Username, value.Password),
		Host:   value.Host + ":" + port,
		Path:   "/" + databaseName,
	}).String(), nil
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
