FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8081

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8081", "--workers", "2", "--timeout", "120"]