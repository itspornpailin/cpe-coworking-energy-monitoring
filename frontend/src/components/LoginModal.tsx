import {
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
  MouseEvent,
} from "react";

import type {
  Language,
} from "../i18n/translations";

import {
  translations,
} from "../i18n/translations";

interface LoginModalProps {
  open: boolean;

  language: Language;

  loading: boolean;

  error: string | null;

  onClose: () => void;

  onLogin:
    (
      username: string,
      password: string,
    ) => void;
}

export function LoginModal({
  open,
  language,
  loading,
  error,
  onClose,
  onLogin,
}: LoginModalProps) {
  const copy =
    translations[language].auth;

  const [
    username,
    setUsername,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const closeModal = () => {
    if (loading) {
      return;
    }

    setPassword("");
    onClose();
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown =
      (
        event:
          KeyboardEvent,
      ) => {
        if (
          event.key ===
          "Escape"
        ) {
          /*
           * Call from the browser event callback,
           * rather than setting state directly
           * inside the effect.
           */
          if (!loading) {
            setPassword("");
            onClose();
          }
        }
      };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    open,
    loading,
    onClose,
  ]);

  if (!open) {
    return null;
  }

  const handleSubmit =
    (
      event:
        FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      if (loading) {
        return;
      }

      const submittedPassword =
        password;

      /*
       * Clear the password immediately after
       * submission so it is not kept in the
       * component state unnecessarily.
       */
      setPassword("");

      onLogin(
        username.trim(),
        submittedPassword,
      );
    };

  const handleBackdropClick =
    (
      event:
        MouseEvent<HTMLDivElement>,
    ) => {
      if (
        event.target ===
          event.currentTarget
      ) {
        closeModal();
      }
    };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={
        handleBackdropClick
      }
    >
      <div
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        <div className="login-modal-header">
          <div>
            <h2
              id="login-modal-title"
            >
              {copy.title}
            </h2>

            <p>
              {copy.loginPrompt}
            </p>
          </div>

          <button
            type="button"
            className="modal-close-button"
            aria-label={
              copy.close
            }
            disabled={
              loading
            }
            onClick={
              closeModal
            }
          >
            ×
          </button>
        </div>

        <form
          className="login-form"
          onSubmit={
            handleSubmit
          }
        >
          {error !== null && (
            <div
              className="auth-error"
              role="alert"
            >
              {error}
            </div>
          )}

          <label className="auth-field">
            <span>
              {copy.username}
            </span>

            <input
              type="text"
              value={
                username
              }
              autoComplete="username"
              autoFocus
              required
              disabled={
                loading
              }
              onChange={(
                event,
              ) => {
                setUsername(
                  event
                    .target
                    .value,
                );
              }}
            />
          </label>

          <label className="auth-field">
            <span>
              {copy.password}
            </span>

            <input
              type="password"
              value={
                password
              }
              autoComplete="current-password"
              required
              disabled={
                loading
              }
              onChange={(
                event,
              ) => {
                setPassword(
                  event
                    .target
                    .value,
                );
              }}
            />
          </label>

          <button
            type="submit"
            className="login-submit-button"
            disabled={
              loading
            }
          >
            {loading
              ? copy.working
              : copy.login}
          </button>
        </form>
      </div>
    </div>
  );
}