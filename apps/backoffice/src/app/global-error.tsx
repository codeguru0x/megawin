"use client";

import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            minHeight: "100dvh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "28rem",
              border: "1px solid #e5e5e5",
              borderRadius: "0.75rem",
              padding: "2rem",
              textAlign: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "3rem",
                height: "3rem",
                borderRadius: "50%",
                backgroundColor: "rgba(220, 38, 38, 0.1)",
                marginBottom: "1rem",
              }}
            >
              <AlertTriangle size={24} color="#dc2626" />
            </div>

            <h1
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                marginBottom: "1rem",
              }}
            >
              Đã xảy ra lỗi
            </h1>

            <p
              style={{
                color: "#737373",
                fontSize: "0.875rem",
                lineHeight: 1.5,
                marginBottom: "1.5rem",
              }}
            >
              Hệ thống gặp sự cố không mong muốn. Vui lòng thử lại hoặc quay về trang chủ.
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "center",
              }}
            >
              <a
                href="/login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#fff",
                  backgroundColor: "#18181b",
                  borderRadius: "0.375rem",
                  textDecoration: "none",
                  border: "none",
                }}
              >
                <ArrowLeft size={16} />
                Đăng nhập
              </a>
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#18181b",
                  backgroundColor: "#fff",
                  borderRadius: "0.375rem",
                  border: "1px solid #e5e5e5",
                  cursor: "pointer",
                }}
              >
                <RefreshCw size={16} />
                Thử lại
              </button>
            </div>
          </div>

          <p
            style={{
              marginTop: "1.5rem",
              color: "#a3a3a3",
              fontSize: "0.75rem",
            }}
          >
            Nếu lỗi tiếp tục xảy ra, vui lòng liên hệ quản trị viên hệ thống.
          </p>
        </div>
      </body>
    </html>
  );
}
