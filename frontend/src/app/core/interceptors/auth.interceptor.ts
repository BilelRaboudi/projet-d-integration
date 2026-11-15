import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('mototaxi_token');
  // N'ajouter le token JWT que pour les requêtes vers notre backend local, pas pour les API externes (ex: Nominatim)
  const isInternalApi = !req.url.startsWith('http') || req.url.includes('localhost') || req.url.includes(':8080');

  if (token && isInternalApi) {
    const cloned = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(cloned);
  }
  return next(req);
};
